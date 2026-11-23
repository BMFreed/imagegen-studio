# CivitAI token status in a fresh KDE wallet profile

The [KDE Install Queue trial](./phase-5-model-install-queue-wayland-research.md)
timed out twice before keyboard input. Its fixture read the local catalog
and storage, then awaited the public token-status call. The private session
logged a KWallet request. Those runs establish a stalled status query.
Model Manager launches the same status query independently of its catalog,
jobs and storage reads, so the timeout alone does not establish an
unresponsive dialog.

## Source and boundary

Studio base `ec20c39b04720706947a51ebd004ae82bd12c726`. The clean InvokeAI checkout was
`4875d96531ca6712b288f6e660fcbb34143408c1`.
Its `invokeai/frontend/webv2/src/features/models/data/apiKeys.ts` reads
account-scoped credential presence for
`ui/credentials/ApiKeysSection.tsx`. The installation caller
`ui/add-models/useInstallActions.ts` resolves the saved credential when
constructing a matching install request. The request passes through
`data/api.ts` and `invokeai/app/api/routers/model_manager.py` to
`invokeai/app/services/model_install/model_install_default.py`.

Invoke uses browser storage for CivitAI credentials and has no Electron
safeStorage or KWallet owner. Studio adapts the presence-first ordering to
Main's private ciphertext file. The saved token stays behind the existing
Electron encryption and verification boundary.

In Electron 44.4.5 the selected Linux storage backend is a cached value.
The asynchronous availability method requests an encryptor and can wait on
its key provider. Studio's old status call awaited that provider before
checking whether a token file existed.
[Electron safeStorage source](https://github.com/electron/electron/blob/v44.4.5/shell/browser/api/electron_api_safe_storage.cc#L160-L199)

The passive status query can report `missing` when the private directory
or token file is absent and the selected backend is eligible. For
`basic_text`, unknown or failed backend selection, the query reports the
existing unavailable reason. Existing ciphertext and filesystem errors
continue through the previous availability, read and decrypt checks.
Explicit Save still verifies secure storage before making the provider
validation request.

## Executed controls

Both absent-file cases failed on the unmodified token store. The controlled
wallet adapter observed an async request before the status returned. The
final source passed both cases, along with a present-ciphertext control
that waits for availability and reports its refusal when released.
The focused suite passed 118 tests with zero failures or skips.
Typecheck, scoped ESLint, formatting and AppImage packaging passed.

The same fresh AppImage ran twice in a private KWin profile. Its SHA-256
is `1b246d0b064dfec8493fa55217dff9b5aabebff85fd2a94f6d7d16eeae6ce483`.

- Run `20261123-r6` kept the stock credential-provider settings. Three
  public IPC reads returned the exact missing-token status. Native KWin
  delivered 71 keydowns and all five focus transitions passed. Both
  lifetimes closed normally in the 12.336-second scope.
- Run `20261123-r7` used the existing `basic_text` test profile. The
  exact secure-storage-unavailable status passed, along with 70 native
  keydowns, five focus transitions and both normal closes.

Both profiles verified that no token file existed before launch or after
either close. After clearing three terminal jobs, the closed database
matched the cold-reopen snapshot byte for byte in each run. Both runs
retained the exact embedding. The default-wallet trial tests passive
status with no saved token. A first-time Save, stored-token use and
wallet unlock remain separate native acceptance cases.

The independent audit verified the embedded ASAR and all 42 compiled
members. Compared with the previous Wayland package, the only changed
compiled member was Main. Among the 20 pinned production sources, only
the token store changed. The audit verified the 26 run sources in each
case and all 40 enrolled AppImage process exits. Cleanup reclaimed
573,239,296 allocated bytes and rechecked the 107 retained files.

## Secure Save, cold unlock and removal on KDE

The follow-up used Studio `1822ef87cf851e1f0832fb65988bed60f56174a8`.
The clean InvokeAI revision was still `4875d96531ca6712b288f6e660fcbb34143408c1`.
The source check covered the credential card and storage helper above, the
install action and API definition under `invokeai/frontend/webv2/src/features/models`,
and the model-install router and service. Invoke's credential flow uses
account-scoped browser storage. Electron safeStorage and system wallet
initialization are Studio's desktop integration.

The stock AppImage SHA-256 was
`d87dc91e09725b1e25219db0bc072e11062f5b39c7634c1e6d2966c1aa0af985`.
In `20261123-r1/native-live-full` the harness created a test wallet
through the native KDE dialog in a private KWin and D-Bus session,
locked it through `org.kde.ksecretd`, and then exercised the public
Save IPC with an authorized live CivitAI account. Save prompted for a
native unlock and returned `connected` after live validation. It wrote
one 51-byte ciphertext file with mode `0600`. The controlled profile
check found neither UTF-8 nor UTF-16LE plaintext in that file.
After normal close and a confirmed lock, the Model Manager reopened with
the same ciphertext. A second native unlock led to `CivitAI connected`
after live revalidation. Clicking **Remove token** removed the file.
The third launch displayed the missing-token status with the wallet
still locked. The three lifetimes closed normally. The receipt retains
the outcome and file size and mode. A preliminary request from the
shell returned HTTP 403 on the endpoint with and without authorization.
The stock application's own validation succeeded in both qualifying
lifetimes.

The controlled sibling `native-6` ran a qualification AppImage whose
only business-code difference was the CivitAI client's transport.
Its fixed peer accepted the exact synthetic bearer on Save and cold
revalidation, rejected a replacement, and received zero requests on
the missing-token launch after Remove. The rejected replacement
preserved the encrypted file byte for byte. The independent audit read
10,872 members from the two packaged ASARs. Only `dist/main/main.cjs`
changed. The other 10,871 members, the native SQLite addon, the embedded
Electron binary and AppImage runtime matched. All three lifetimes
closed normally.

### Creating the first wallet from Save

The `native-virgin` control started without any wallet and let Save
trigger the creation dialog. Native KWin keys submitted both password
fields. The wallet file appeared and the direct KDE daemon reported it
open. Studio still showed the Save progress state at the 10-second
checkpoint, before any provider call or token file write. The app
closed normally. A standalone request through KDE's `kwalletd6`
compatibility API returned `-1` on an empty test profile, while the same
creation and password input through `ksecretd` opened and later
unlocked the wallet. KWallet Framework 6.24.0's compatibility wrapper calls the
Secret Service for creation and unlock. Its asynchronous method only
emits the wallet-opened signal after a successful result.
[KDE compatibility implementation](https://github.com/KDE/kwallet/blob/v6.24.0/src/runtime/kwalletd/kwalletd.cpp#L306-L378)

The `native-virgin-retry` control reproduced the stall. It closed the
AppImage normally, locked the new wallet, then repeated Save in the
same profile. The expected unlock dialog did not appear within the
retry window and the provider received no request. Neither run
established a recovery sequence for this first-wallet path.

The live result covers an existing, initially locked KDE wallet on
this host. First Save with no existing wallet remains an open KDE
integration case. Shipping candidate, other secure-storage backends
and model download are separate release checks. The focused token
store, ModelService and renderer read-guard suites passed 100 tests,
with zero failures or skips. The stock AppImage build passed.
Independent checks confirmed 81 enrolled AppImage process exits across
the two passing lifecycles and the two empty-wallet controls. Cleanup
removed 1,069,580,288 allocated bytes of packaging and scratch data.
The receipts and source pins remain under
`runs/packaged-civitai-secure-token/20261123-r1` in the local artifact root.
The temporary wallet and credential files were removed.

## Bounding the first-wallet wait

Studio base `83467f602b133f794d05666cf7820302009ed4f5`. The clean InvokeAI
checkout was `4875d96531ca6712b288f6e660fcbb34143408c1`. The fresh check
covered `invokeai/frontend/webv2/src/features/models/data/apiKeys.ts`,
`ui/credentials/ApiKeysSection.tsx`, `ui/add-models/useInstallActions.ts`,
`ui/install-queue/useInstallJobActions.ts` and `data/api.ts` under that
feature. It followed the install request through
`invokeai/app/api/routers/model_manager.py` to
`invokeai/app/services/model_install/model_install_default.py`.
Invoke uses account-scoped browser storage and passes the token on a matching
CivitAI install or retry. System keyring initialization belongs to Studio's
desktop integration.

The isolated baseline trace recorded a D-Bus method return for `openAsync`
on `/modules/kwalletd6`. The password dialog created and opened the wallet.
The trace recorded `walletAsyncOpened` from `/ksecretd`, the internal daemon.
The compatibility endpoint sent no corresponding signal during the 70-second
observation. Chromium 152.0.7977.130, shipped with Electron 44.4.5, waits for
a matching signal on the compatibility endpoint. The KDE wrapper suppresses
the compatibility signal when its internal open fails. In KDE Frameworks
6.24.0 a first lookup also reads a collection pointer after moving it into
the cache. KDE 6.29.0 fixes that lookup and refreshes the collection list.
A first Save against that version is still part of release qualification.
[Chromium wallet call](https://chromium.googlesource.com/chromium/src/+/152.0.7977.130/components/os_crypt/async/browser/freedesktop_secret_key_provider.cc#608),
[KDE wrapper](https://github.com/KDE/kwallet/blob/v6.24.0/src/runtime/kwalletd/kwalletd.cpp#L361-L378),
[KDE 6.29.0](https://kde.org/announcements/frameworks/6/6.29.0/).

The token store allows one minute for the shared Electron availability
request. This is a Studio response deadline for a user-driven desktop
prompt. Expiry releases the wait before CivitAI validation, encryption
or filesystem writes. Retries share the expired result while the original
native request is pending. An eventual native response lets a new
explicit Save proceed. Missing-token status still uses backend selection
without starting an availability request. An existing-token read reports
the temporary failure and releases the store queue so Remove can proceed.
[Electron initialization](https://github.com/electron/electron/blob/v44.4.5/shell/browser/api/electron_api_safe_storage.cc#L72-L128),
[token store](../../src/main/models/civitai-token-store.ts).

An independent Electron process using a private D-Bus session without
keyring services selected `kwallet6`, reported async availability, and
produced a `v10` ciphertext from Chromium's fixed-key POSIX provider. On
Linux, the token store now rejects this tag before replacement, rotation
or decryption. A pre-existing file stays intact until explicit Remove or
successful secure replacement. Model Manager offers Remove when the
check of a saved token fails.
[Chromium POSIX provider](https://github.com/chromium/chromium/blob/152.0.7977.130/components/os_crypt/async/browser/posix_key_provider.cc),
[Model Manager](../../src/renderer/components/ModelManager.vue).

The availability regressions failed on the baseline due to unresolved
operations. The fallback regression separately observed a missing
refusal before the tag check was added. The passing cases verify queued
removal, no implicit write or CivitAI request after late readiness,
explicit retry and byte preservation during failed replacement and
rotation.

The stock AppImage replay used private KWin, D-Bus, wallet and app
profiles. The empty-wallet case reached the existing Model Manager
error and cleared the Save progress state after 60.6 seconds.
Retry in that process returned the same error in 59 milliseconds, and the
token file remained absent. The provisioned-wallet case passed real
CivitAI Save and cold revalidation with native unlock and a 51-byte
`v11` file in mode `0600`. Remove left no token, and cold missing left
the wallet locked. A fourth launch admitted an old `v10` fixture only
for explicit removal through Model Manager after the read refusal.
The five AppImage lifetimes closed normally. The final focused
selection passed 123 tests with zero failures or skips, and typecheck,
scoped lint and AppImage packaging passed.

The independently checked AppImage SHA-256 is
`8f4dc56540074774094f290da810301e067d05c7b37ad560c65f646539a6629d`.
The byte audit compared the embedded ASAR and unpacked members. It
confirmed that the last packaging pass reordered only the declarations
reported by lint in the compiled Main. The independent process check
confirmed 45 enrolled AppImage processes had exited. Cleanup reclaimed
2,175,561,728 allocated bytes. The compact receipts are under
`runs/civitai-wallet-recovery/20261123` in the local artifact root.

## First Save with KWallet 6.29

The same stock AppImage from
`42a7891182fc772c08e4e3de1c65511b739b18ca` ran the 6.24 and 6.29 cases.
Its SHA-256 was
`f798d4e58eff127a286b66a4be3b4d75f0d25d8cc525c3f29c7b3e76284b8db4`.
The comparison used the Ubuntu 26.04 host's private Wayland and D-Bus
session. For the 6.29 case, only the wallet daemons and their libraries
ran from an extracted Ubuntu 26.10 package closure in Bubblewrap.
The Ubuntu archive signature, main and universe index hashes, and all
211 package bodies were verified. The closure contained KWallet
`6.29.0-0ubuntu1`, Qt `6.11.2+dfsg-4ubuntu2` and glibc
`2.44-1ubuntu2`. The running wallet executables matched signed package
members by device, inode and hash.
[Ubuntu package](https://packages.ubuntu.com/stonking/kwallet6).

With system KWallet 6.24, the empty-profile control again produced a
Studio timeout at about 60.5 seconds. The compatibility endpoint
returned from `openAsync` without sending its completion signal.
With KWallet 6.29 and no wallet, `networkWallet` returned a D-Bus error
before Chromium could call `openAsync`. KDE 6.29 removed the configured
wallet-name fallback when the default Secret Service alias is absent.
The desktop portal then opened the native creation dialog and created
the wallet. After provider validation, the token store refused to
persist the credential and left no token file. Chromium enables portal
retrieval by default. Its separate flag for using the portal key for
new encryption is disabled by default.
[KDE change to default wallet lookup](https://github.com/KDE/kwallet/commit/5fed650b0db2),
[Chromium portal flags](https://chromium.googlesource.com/chromium/src/+/refs/tags/152.0.7977.130/chrome/browser/browser_features.cc#160).

After a normal AppImage close, a new launch reused the same private
profile and wallet. The explicit retry passed live CivitAI validation
and saved a 51-byte `v11` ciphertext in mode `0600`. The compatibility
endpoint completed `openAsync` on this launch. After close and confirmed
wallet lock, the next launch prompted for native unlock and revalidated
the saved token. Explicit Remove deleted the file. The last launch
reported the missing-token status with the wallet still locked.
All four 6.29 lifetimes and the 6.24 control closed normally. First Save
used the stock renderer IPC and native KDE dialog. Reopen and Remove
used the visible Model Manager.

The independent audit verified 45 enrolled AppImage process exits,
both wallet daemon exits, and the signed package and AppImage identities.
Cleanup reclaimed 1,363,542,016 allocated bytes. The package manifest,
traces and receipts are under `runs/kwallet629-first-save/20261123` in
the local artifact root.

## First Save without restarting Studio

The stock AppImage came from `66965364b1a7d038cdfbae5d580db515dd7a3400`.
The comparison used private Wayland, D-Bus and wallet profiles. For
KWallet 6.29, the 211 packages from the previous signed Ubuntu closure
were reacquired and checked against the retained SHA-512 values.
Running daemon binaries matched the verified package bodies.

InvokeAI `4875d96531ca6712b288f6e660fcbb34143408c1` uses account-scoped
browser storage. The fresh check covered
`invokeai/frontend/webv2/src/features/models/data/apiKeys.ts`,
`ui/credentials/ApiKeysSection.tsx`, `ui/add-models/useInstallActions.ts`,
`ui/install-queue/useInstallJobActions.ts` and `data/api.ts` in that
feature, followed by the `model_manager.py` router and model-install
service. The prerequisite desktop wallet interaction belongs to Studio's
Electron integration.

### Secret Portal encryption

In KWallet 6.29, launching the stock AppImage with Chromium's
`SecretPortalKeyProviderUseForEncryption` flag let the first Save
create the wallet and persist a 63-byte `v12` token file in mode
`0600`. A cold read with the flag kept the ciphertext byte for byte.
Turning the flag off allowed the next launch to read that `v12`
file and rotate it to `v11`. Turning the flag back on read the
`v11` file and rotated it to `v12`. CivitAI validation, Remove
and cold missing passed in this cycle.

All four portal calls in the bare AppImage cycle carried an empty
application ID. A control with a discoverable private
`imagegen-studio.desktop` file carried `imagegen-studio` on all
four calls. KDE uses that ID as the wallet entry name. In a separate
named cycle, removing the desktop file made the saved `v12` file
unreadable while preserving its bytes. Restoring the desktop entry
restored access to the unchanged credential. The launch flag therefore
also changes the operational requirements for portable AppImage
launches and key continuity.
[Portal host identity](https://github.com/flatpak/xdg-desktop-portal/blob/1.21.1/src/xdp-app-info-host.c#L164-L285),
[KDE portal key lookup](https://github.com/KDE/kwallet/blob/v6.29.0/src/runtime/ksecretd/kwalletportalsecrets.cpp#L47-L75).

KWallet 6.24 first Save still reached Studio's timeout with the flag.
Chromium initializes the asynchronous providers serially and waits for
the KWallet callback before asking the Secret Portal for a key.
[Chromium provider initialization](https://chromium.googlesource.com/chromium/src/+/152.0.7977.130/components/os_crypt/async/browser/os_crypt_async.cc#145).

### Creating the default wallet before Electron requests a key

An independent test-only helper used the Secret Service
`CreateCollection` and native KDE prompt on one D-Bus connection.
It required an empty collection list and absent default alias before
requesting creation. It checked the accepted prompt, the daemon identity
and the default alias before returning. The helper ran after Studio
opened and before its first asynchronous safeStorage request.
The stock Save IPC then validated with live CivitAI and wrote a
51-byte `v11` file in mode `0600` in the same application process
on both KWallet 6.24 and 6.29. Cold unlock and revalidation kept the
file byte for byte. Explicit Remove and cold missing also passed.
The helper refused a second creation request with an existing wallet,
and the token file stayed byte-identical.

A KWallet 6.29 control dismissed the native password dialog. It
produced neither a wallet file nor a token file. An explicit retry in
the same application process created the wallet and saved a
`v11` credential. KDE can write the alias configuration before the
password dialog completes, so the cancellation observation covers
the wallet and token files.
[Secret Service creation and prompt protocol](https://specifications.freedesktop.org/secret-service/latest/org.freedesktop.Secret.Service.html#org.freedesktop.Secret.Service.CreateCollection),
[KDE prompt implementation](https://github.com/KDE/kwallet/blob/v6.29.0/src/runtime/ksecretd/kwalletfreedesktopprompt.cpp#L34-L108).

Production integration of wallet creation remains open. It requires a
packaged Secret Service client, an explicit Save owner for the dialog,
and concurrent default-alias ownership controls.

The token store now checks for a stored file before requesting the
asynchronous provider during a token-dependent read. Backend selection
still refuses insecure and unavailable selectors. Both absent-file
regressions reached the async wallet on the baseline, then passed with
no async call after the change. The valid ciphertext reader still
requires secure storage before decryption and rotation.
[Token store](../../src/main/models/civitai-token-store.ts).

The rebuilt AppImage received a public CivitAI preview request before
the helper ran. It returned `CIVITAI_TOKEN_REQUIRED` in 3 milliseconds.
The D-Bus trace shows the helper's `CreateCollection` and successful
prompt completion before the first key-provider request. Save then
passed in the same process. Cold unlock, Remove and cold missing passed
in subsequent launches. Typecheck, scoped ESLint, AppImage packaging
and 125 focused tests passed with zero failures or skips.

The comparison AppImage SHA-256 was
`9fc107b22bc0bdc29bdcd018030bf6a5e51a52e80bb0ab03eca31dc904aebe6b`.
The rebuilt AppImage SHA-256 was
`b8afb3e8ec17a23ed79788059fcf2235b13068b4b891506e93c528b9937bc334`.
The run receipts cover 26 normal AppImage closes and 234 enrolled
process exits. Cleanup reclaimed 1,605,885,952 allocated bytes.
The receipts are under `runs/civitai-portal-encryption/20261123` and
`runs/civitai-missing-token-read/20261123` in the local artifact root.
