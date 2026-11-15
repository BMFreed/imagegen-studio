# Signed application release declarations

Base: `413b91589d1bbc9f3930c2d75abb6ca6c2293e17`, `master`; this note describes
the dirty delivery tree, including new application-release and publisher CLI files.
Risk: **High**, release trust, native metadata/download selection and private
filesystem capabilities. Contracts: [Application Updates](../features/application-updates.md),
[PP-002](../product-promises.md#pp-002-явное-намерение-вместо-магического-control),
[research](./research-protocol.md) and [review](./review-protocol.md).

## Fresh source and finite adaptation

Read InvokeAI `4875d96531ca6712b288f6e660fcbb34143408c1`
`docs/src/content/docs/start-here/installation.mdx`, which delegates app updates
to launcher `c267bdb439519216b277a7a8c6ad408b9d79efce`. Read that launcher's
`src/main/updater.ts` and its `src/main/main-process-manager.ts` caller. The
launcher reuses electron-updater for Check/Download/Install; it does not provide
a Linux publisher-signature producer or Studio's Project/worker/migration
compatibility declaration. This absence was disclosed before adding the Studio
domain adapter. The upstream AppImage installer still unlinks the old executable
before moving the candidate; this change does not invoke it.

The current installed **electron-updater6.6.2** remains the provider, comparison,
transfer and cache owner. Its `out/AppUpdater.js` calls
`getUpdateInfoAndProvider` before `isUpdateAvailable`, and
`out/AppImageUpdater.js` selects the AppImage and retains native differential/full
download behavior. Studio authenticates the returned provider selection at that
existing boundary. No separate provider, downloader or signature algorithm is added.

The existing canonical Ed25519 mechanism is reread in
`src/main/runtime/runtime-release.ts`: `canonicalRuntimeReleaseJson` and
`verifyCanonicalRuntimeEnvelope`. Its signing caller and fd-anchored output owner
are in `src/main/runtime/runtime-release-transport.ts`; the existing publisher
CLI is `scripts/produce-runtime-transport.mjs`. The new app domain verifier and
`scripts/sign-application-release.mjs` adapt those owners. Runtime release schemas
and runtime publisher configuration remain separate.

## Data and authority

An explicit Help Check enters the existing trusted-window/main-frame/document
IPC and `ApplicationUpdateService`. Its lazy checker factory reads the bundled
`resources/app-update-trust.json`, independently of the provider's `app-update.yml`.
The trust file has exactly `schemaVersion: 1`, `appId: studio.imagegen.desktop`
and a nonempty `keys` map of keyId to public Ed25519 PEM. A missing keyring keeps
the configured legacy path **metadata-only**. An invalid existing keyring refuses;
it cannot silently downgrade to that path. A default build without publisher
configuration remains **unavailable**. There is no startup check or new network action.

Main captures compatibility from the actual owners: `IGS_SCHEMA_VERSION`, the
CPU/inference worker protocol constants and `readAppliedSqlMigrations` from the
open database's ordered `schema_migrations` name/SHA256 rows. The latter is an
inventory read, not a new migration runner or a scalar migration-count shortcut.
Trust/context inputs are copied before native asynchronous use.

With a keyring, `VerifiedAppImageUpdater.getUpdateInfoAndProvider` requires a
bounded JSON envelope in the provider's `imagegenStudioRelease` string. The exact
generic envelope is `{schemaVersion: 1, keyId, payload, signature}`; payload and
signature are canonical base64, and the signed payload is canonical JSON. The app
payload has the exact `application-release` scope, app ID, release/version,
Linux/x64/AppImage target, one artifact descriptor, compatibility and notes digest.

The verifier binds the provider's actual selected version, decoded basename,
positive safe-integer size and canonical SHA512 to the signed descriptor. It
binds the raw native release-notes value through SHA256 of canonical JSON before
the existing bounded plain-text UI projection. It requires exact Project/CPU/
inference protocol declarations and includes **every currently applied migration
name with its exact hash** in the signed migration inventory. Candidate inventory
may include later migrations; this does not execute or prove them.

These checks authenticate the publisher's declaration. They do not establish
AppImage executable format, internal binary version, SQLite upgrade/rollback,
worker handshake or installed image-engine readiness. `runtimeValidation` is
exactly `after-restart`; a pre-install `ready` assertion is not admitted.

Unsigned native policy is not broadly trusted with the declaration. In this
finite signed profile, `stagingPercentage`, `minimumSystemVersion`, `packages`
and the selected descriptor's `blockMapSize` are rejected before native
availability evaluation, including a no-update result. The artifact URL remains
provider configuration, not a signed field. Selection, resolved URL, envelope and
notes are rechecked across Check/Download; the signature authenticates the
declared content rather than every feed field. Legacy differential policy stays
unchanged.

Explicit Download retains native transfer/cache and final saved-file SHA512/size
checks, including cache reuse. A successful signed download creates a Main-private
`VerifiedApplicationArtifact` with a frozen manifest, native path and revalidation
closure. The service revalidates before `downloaded`; its private
`prepareVerifiedArtifact` gate revalidates again and checks current selection.
New checks, new download attempts, changed provider selection or a failed
revalidation retire the previous authority. Public status never contains the
path, keyring, manifest, closure or an install token. No public installer consumer
is introduced by this capability.

The existing snapshot adds one bounded `verification` field. Idle/checking/
up-to-date/error/unavailable carry null; available/downloading/downloaded/
download-error carry `metadata-only` or `signed-release`. The latter reports
signature, descriptor/notes and compatibility-declaration acceptance, not engine
readiness. Available/downloaded UI shows “Publisher signature verified.” and
“Compatibility declaration accepted. The image engine will be checked after
restart.” Installation remains unavailable. Legacy downloaded copy still warns
that publisher authenticity and installation have not been verified. No buttons,
checks, polling or install actions are added.

## Publisher producer and limits

`pnpm exec tsx scripts/sign-application-release.mjs` requires all of:
`--manifest ABS_JSON --notes ABS_JSON --artifact ABS_AppImage --private-key ABS_PEM
--key-id ID --output ABS_NEW_ENVELOPE`. Notes are the raw releaseNotes JSON value.
The producer reads actual artifact bytes through a regular readonly nofollow FD,
checks stable FD/path identity for the hash read, and replaces template artifact
basename/size/SHA512 and notes digest with computed values. It signs with an
explicit Ed25519 key, derives the public key and calls the same app-domain verifier
against the manifest's declared compatibility before creating output. The client
still compares its own installed context independently.

JSON inputs, canonical payload and whole envelope are bounded to1MiB; private
key input is bounded to16KiB and must be an owned private regular file. The hash
stream uses the existing1MiB chunk pattern. Inputs and existing outputs are not
modified. Output is create-only0600, fd-anchored in an existing canonical plain
parent and fsynced; the producer does not chmod or create an arbitrary parent.
Failure diagnostics are fixed and never print key bytes or parser inputs. The
producer does not generate keys, perform network work, verify executable format
or internal app version, execute SQL, install an application or validate its engine.

## Failure boundaries and verification

Missing/unknown keys, malformed/noncanonical/tampered envelopes, domain/target
substitution, descriptor/notes mismatch, incompatible declarations, omitted or
changed applied migrations and unsupported unsigned policy must refuse before
native download authority. A signature failure is an error, not a no-update
claim. A new no-update/error check must revoke an older available selection.
Changed bytes, metadata or retired capabilities refuse signed completion/handoff;
existing native cache invalidation permits explicit retry where its safe cache
guards allow. No failure starts restart, closes a Project or changes runtime/model
pointers. Normal Project Save/close/recovery remain their existing owners.

The adjacent control is the same declared signed release with original artifact,
notes, key/context and selection. A useful semantic mutation removes actual
signature/declaration enforcement while preserving native transport checks; it
must fail at the signed consumer, not at setup/import/timeout. A future installer
must use the private revalidation gate immediately before its own material action
and separately qualify close preview, replacement and recovery.

Root independently executed the final **190 targeted tests PASS** (application
release/native updater/service/IPC/DTO, publisher CLI, existing database and Linux
package guards), **323 browser PASS**, `pnpm run typecheck` and `pnpm run app:build`
PASS. Full lint passed with its same two unchanged baseline parser exclusions:
`scripts/qualify-installed-regional-init.mts` and
`scripts/qualify-regional-character-visual.mts`. Its first monolithic `src` attempt
hit the driver's2048MiB V8 heap; this is excluded from PASS. Eight disjoint source
partitions cover all709 eligible files, followed by prototype/docs scopes, within
the same4GiB/zero-swap/600s process envelope. No further exclusions were added.

Actual fused AppImages used builder26.17.0/Electron44.4.5 and the existing real
packaged Main/preload/SQLite/UI consumer outside the checkout. Four flows—default
unavailable, signed original, signature-bypass mutation, exact original—completed
**eight normal physical exits**, without forced cleanup. Each signed flow observed
**10 metadata /3 artifact requests**, native progress, corrupt transfer refusal,
held-transfer dialog close/reopen, same-process saved-file tampering refusal,
explicit recovery download and restarted cache revalidation. The default made no
network request. Startup/status reads and metadata faults made no artifact request;
public Download probes after rejected checks retained the error and stale-provider
refusal. Each own Project's bytes survived restart.

The six actual metadata faults cover bad signature, descriptor size, applied
migration hash, CPU protocol, displayed notes and unsigned staging policy. Original
and restored runs reject all six. An isolated compiled copy bypasses only the
existing canonical signature gate in the app-domain verifier: actual
`bad-signature` becomes `available`/`signed-release`, while the other five faults
still refuse. The harness retains that false acceptance, performs no fault Download,
and gives **semantic RED after both normal lifetimes and server drain**. This is
not a setup/OOM/timeout RED. Original/restored AppImage hashes match exactly; the
mutant changes only `dist/main/main.cjs`, with10,871 common regular files unchanged.
Native transfer/final cache verification and all original source/live dist bytes
stay unchanged. The ordinary and qualification-feed packages have identical ASARs;
only the latter bundles its ephemeral public qualification keyring/feed.

Independent delegated finite production/harness source review is **CLEAN**, with
no execution claim. Root separately reviewed and executed the real signing CLI;
the author's source-only self-review is not counted as independent qualification.
Prototype and packaged900×620 screenshots were actually viewed: signed declaration
copy, literal notes, progress and reachable controls fit; this is renderer viewport
emulation, not physical native-window resizing. Eight workspace SQLite prebuilds
retain exact bytes, modes, inode and mtime.

Evidence is retained under
`~/.codex/artifacts/imagegen-studio/runs/application-release-trust/20261115`:
`final-native-summary.json`, `native-mutation-byte-proof.json`, source review,
bounded check logs/receipts, exact fixtures/three AppImages and native evidence.
`retained-payloads.tar.gz` preserves all **5,526 entries** remaining at the archival
checkpoint with complete membership/kinds/modes/link-text/file-hash verification.
The separate unpacked producer scratch was inventoried and disposed only after
all exits and exact fused-package retention; its raw entries are explicitly not
claimed as archived. Root reclaimed **1,723,891,712 allocated bytes** from its
idle scratch/payloads/TMP, preserving shared ML/runtime/model/managed data and
external files. The canonical default AppImage remains pinned for the next
Install/recovery consumer. Retention is separate from source review, execution,
final staged-byte audit and the independent retained-byte audit recorded in the
same run. All checks are current-host qualification with a temporary test key and
deliberately non-installable download body, not shipping or binary-upgrade proof.

## Remaining release gates

No real shipping publisher URL, public key/keyId or signed release is configured.
This consumer/producer work does not ask the user to create a publisher before
implementation can proceed. Full Install Update preview, close sequencing,
recoverable AppImage replacement/rollback, supported-host clean install/upgrade,
real migration/protocol compatibility and final MVP acceptance remain open.
App-update publisher trust and ML-runtime delivery remain separate lifecycles.
All public promise statuses, including PP-002 and PP-001/005/007/008, stay unchanged.
