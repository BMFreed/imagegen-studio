# Main-owned LaMa delivery and engine byte planning

Date: 2026-10-06. Base: `1a6a82a31f462221bd70cad0c21c53772222870f`
on `master`; this note describes the subsequent working-tree checkpoint.
Risk: High — network download, resource publication and filesystem ownership.
Supporting contracts: [runtime management](../specs/07-python-runtime-management.md),
[PP-003/PP-008](../product-promises.md),
[internal outpaint execution](./phase-2c-outpaint-execution-research.md).

## Expected result and verified scope

The product decision is to install the shared LaMa weights with the first engine
setup, showing the complete download volume beforehand. Main owns downloading
and byte verification; Python only consumes an exact local file. The artifact
remains outside individual model directories and disposable runtime environments.

Confirmed: `RuntimeManager.install()` and `repair()` still return
`RUNTIME_INSTALL_UNAVAILABLE`. There is no complete runtime release installer to
extend yet. This checkpoint therefore supplies an internal auxiliary installer
and a complete-artifact byte planner for that future owner. It does not connect
the renderer Set up action or enable public mixed-alpha Generate/Retry.

The auxiliary preview explicitly says `scope: auxiliary-weights`; its byte count
must never be presented as the complete engine download. The engine planner
requires a nonempty trusted runtime artifact list and always appends pinned LaMa.
Only Main can establish release-manifest completeness and installed-file proofs.
No release URL, signing key, runtime size or sufficient free-space estimate is
invented here. Installed footprints remain unknown where the manifest lacks them.

## Owners and data path

`createEngineInstallPlan()` accepts strict, path-free trusted artifact identities,
optionally exact Main-verified installed identities, and returns a detached frozen
plan. Reuse requires matching ID, kind, filename, SHA-256 and byte count.

`createLamaAuxiliaryInstaller()` fixes the URL, role, hash, filename and size from
`lama-manifest.ts`. Its generic class is an internal trusted-Main test seam, not
an IPC manifest or arbitrary destination interface. A preview binds a one-use
expiring plan to the root directory inode and observed installed state. If a
zero-download preview becomes invalid, installation refuses and requires review
of a new preview; it cannot silently increase the reviewed volume. A newly valid
file may be reused after a preview that originally required downloading.

The installer reserves the canonical resource root in the single Main process,
opens directory descriptors and uses Linux `/proc/self/fd` anchors for writes,
publication and cleanup. A UUID work directory contains the streamed download
and a separately verified publication copy. Both complete byte identities are
checked independently of downloader metadata. A regular previous destination is
retained as a synced hardlink backup before replacement. Rename occurs only after
exact verification, then the directory is synced and the installed file is verified.
Post-rename failure rolls back only while the destination still matches this
publication's inode. Uncertain rollback reports `AUXILIARY_RECOVERY_REQUIRED` and
retains the private backup rather than deleting recovery material.
Cancellation is honored before the rename; cancellation after publication does
not retroactively label a committed file canceled. Cleanup unlinks flat owned work
files through the original descriptor, followed by an optional nonrecursive rmdir.
It never recursively removes a substituted directory. A final concurrent empty
replacement may lose its empty directory entry; foreign contents remain preserved.
Plans and reservations die with the process. Candidate work ownership is checked
against the original parent's anchored inode before any cleanup ownership is taken.

`ModelDownloader` adds an `invoke-lama` source with exact manifest admission before
DNS or filesystem effects. Redirects permit only `github.com` and
`release-assets.githubusercontent.com`, retaining HTTPS, public-DNS/socket pinning,
timeouts, bounded streaming, size/hash validation and cancellation. LaMa requests
never receive a CivitAI token. Existing CivitAI/Hugging Face behavior is preserved.
Independent code review also found an inherited native HTTPS buffering defect:
Node's default `Readable.toWeb` strategy counted chunks against a byte-based HWM.
The adapter now counts `chunk.byteLength`; a native TLS unread-consumer control
tests sender backpressure and exact eventual bytes. This follows the
[Node stream API](https://nodejs.org/api/stream.html#streamreadabletowebstreamreadable-options).

## Parameters and refusal behavior

| Parameter                 | Source / value                                                                                                                   | Behavior and evidence boundary                                                             |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Pinned artifact           | `lama-manifest.ts`: `big-lama.pt`, 205,669,692 bytes, SHA-256 `344c77bbcb158f17dd143070d1e789f38a66c04202311ae3a258ef66667a9ea9` | Immutable production factory and downloader admission; altered identity refuses            |
| URL                       | Sanster/models release `add_big_lama`, GitHub asset 49462813                                                                     | Fixed initial URL and two exact redirect hosts; no arbitrary mirror                        |
| Preview lifetime          | Decision: 10 minutes, injectable clock for tests                                                                                 | Expired/consumed preview refuses; pending plans capped at 32                               |
| Concurrent install        | One per canonical root in single-instance Main                                                                                   | Busy refusal before download; no persistent stale lock after crash                         |
| Verification/copy buffers | At most 1 MiB                                                                                                                    | Descriptor checks, exact size/hash and source identity before/after copying                |
| Download artifact staging | Planner sum of nonreused source bytes                                                                                            | Excludes publication copy, unpack scratch, backups and old runtimes; not a disk-space peak |
| Exact accounting          | Positive safe integer byte counts and overflow-checked sums                                                                      | Unknown installed footprints stay `null`; no guessed conversion                            |
| Focused checks            | Whole-process 2 GiB, zero swap, Node heap 512 MiB, deadline                                                                      | Sequential suites; OOM/import/collection never count as mutation detection                 |

## Failure and recovery invariants

Missing or corrupt regular destination files can be replaced only after new exact
bytes are ready. Network, size/hash, cancellation, invalid destination, changed
root and invalid download metadata leave the prior destination untouched. Symlink,
FIFO and directory destinations refuse. A pathname replacement cannot redirect
publication or recursive cleanup into the substituted directory.
Private work files assume exclusive ownership by the single Main process;
arbitrary malicious same-UID in-place writers are not a claimed security boundary.

Interrupted download leaves no installed partial file. Process death may leave a
private abandoned UUID work directory; this checkpoint does not guess ownership
and delete it during subsequent operations. Only the fixed fully verified file
counts as installed. Future runtime reconciliation can clean abandoned staging;
it must not treat work files as ready resources. Directory sync or post-publication
verification failures attempt guarded rollback; the next preview re-verifies actual
bytes. Failed rollback retains its backup and reports an explicit recovery error.
Durable recovery of an interrupted backup/publication sequence belongs to future
release reconciliation; no cross-process transaction journal is implemented here.

Alternatives rejected: registering LaMa as a checkpoint; storing it in clearable
cache; trusting successful downloader metadata; publishing before verification;
displaying only LaMa bytes as engine volume; persistent locks without a reliable
crash-recovery owner. The trusted full runtime manifest and integration remain
explicit prerequisites rather than fictional successful setup.

## Verification plan and evidence

Real helper and filesystem tests cover success/reuse, corruption/cancellation,
concurrency, plan expiry/consumption/budget changes, root replacement, nonregular
destinations and download metadata versus actual bytes. Downloader tests exercise
fixed admission, redirect/DNS/auth/size/hash refusals and existing successful
CivitAI/Hugging Face neighbors. Tiny trusted artifacts isolate filesystem lifecycle;
they do not claim to be genuine LaMa. A separate production-factory run uses the
actual pinned 205,669,692-byte weights through real streamed downloader and final
resolver, substituting only network transport and using isolated storage.

Semantic mutations run in isolated copies against the real functions. Baseline
and restoration must pass; the intended assertion failure must be observed.
Code/type/build checks and ordinary desktop regression evidence remain separate
from a complete release installer or installed public outpaint qualification.

Executed focused evidence, with zero skipped tests:

- Downloader and planner: 58/58; native TLS backpressure and exact size/hash
  neighbors are included. Whole-process peak 295.2 MiB, zero swap.
- Auxiliary installer and existing resolver: 66/66, including absent-prior
  rollback and failed rollback-sync retention. Whole-process peak 65 MiB.
- Fourteen semantic mutations detected by the intended assertion failures:
  omitted LaMa bytes, wrong-digest reuse, integer overflow, invented footprint,
  unreviewed repair, overlapping owners, unverified reuse, premature publication,
  nonpinned size, untrusted redirect, omitted stream hash, foreign work ownership,
  omitted rollback and chunk-count buffering. Isolated baseline/restoration each
  pass 103/103. Whole-process peak 278.4 MiB, zero swap, 6.953 seconds.
- Genuine pinned LaMa filesystem qualification: exact 205,669,692-byte install,
  3,139 streamed progress callbacks, production resolver verification and subsequent
  independently rechecked zero-download reuse; one substituted transport call.
  Whole-process peak 519.2 MiB includes filesystem page cache; process max RSS
  138.34 MiB. This is not a public GitHub download or a Python inference run.

Independent read-only review found the native queue budget, work acquisition and
post-rename preservation issues described above; the implementation and actual
regressions address them. Root performed execution and self-review separately.
Two fixture issues were exposed and fixed before successful evidence: Node 24's
`FileHandle.close` is an instance property, so the verifier-close observer must
wrap real opened handles; an early-publication mutant can replace the destination
with a FIFO, so tests check its regular-file kind before reading. The blocked
mutation run was stopped as a whole cgroup and was not counted as detection.

Artifacts: `/home/user/.codex/artifacts/imagegen-studio/lama-install-2026-10-06/`.
`mutations.json` contains commands, selected scenarios, counts, logs and production
source hashes; `qualification.json` distinguishes real filesystem/weights from
substituted network. Final general checks and hashes are in `delivery.json` after
completion. Python inference code/protocols are unchanged; no GPU/ML suites are
rerun for this delivery-only checkpoint.

General validation: 2,010/2,010 app tests, zero failed/skipped, in 99.793 seconds
with a 507.2 MiB whole-process peak; `pnpm run typecheck`, `pnpm run lint` and
`pnpm run app:build` pass. Fresh-build Electron Generate/Cancel/Retry and
Add/Save/reopen/comparison smoke passes with controlled runtime/pixels and no
page errors (70.098 seconds, 764.9 MiB peak). This preserves ordinary integration;
it does not connect LaMa setup or qualify public outpaint. Final formatting, local
documentation links and `git diff --check` are verified before commit.

## Remaining work

Complete trusted runtime release manifests and runtime installation/repair,
aggregate preview/progress/cancel IPC/UI, peak disk-space checks and shared-resource
reconciliation remain open. Public outpaint additionally needs family-specific
controller preparation, exact local helper/runtime capability, synchronous current
document fences at durable admission, safe Retry, contextual controls and installed
trained qualification. Ordinary generation and Save must remain usable when LaMa
is unavailable. No promise readiness is raised by this internal checkpoint.
