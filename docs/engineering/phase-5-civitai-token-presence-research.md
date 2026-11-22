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
