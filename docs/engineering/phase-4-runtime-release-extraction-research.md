# Verified runtime release extraction

Base: `8082474d` on `master`. Risk: **High** — expansion of an authenticated
archive containing executable files and symlinks, filesystem ownership,
interruption and transfer to the existing runtime installer boundary.
Supporting contracts: [runtime management](../specs/07-python-runtime-management.md),
[PP-001](../product-promises.md#pp-001-понятный-интерфейс-вместо-собираемого-workbench),
[release transport](./phase-4-runtime-release-transport-research.md),
[artifact lifecycle](./artifact-lifecycle.md). Public promise statuses remain
unchanged.

This note records source research and finite acceptance criteria. Actual source,
test, runtime, resource and audit results remain Root's completion evidence;
authored checks do not establish successful extraction.

## Expected result and retained boundaries

The completed transport producer already supplies a real ZIP and detached
authenticated bindings to the exact existing runtime envelope. Transport
verification authenticates those bytes but deliberately does not extract ZIP
members or establish that their structure matches the inner inventory.

This stage adds a bounded filesystem consumer that verifies the transport,
checks ZIP structure against the signed runtime inventory, and expands it into
a new private payload directory. The existing `verifyRuntimeRelease` then
validates the resulting directory. Success returns a `RuntimeReleaseSelection`
for existing downstream consumers; it does not create or activate a Python
environment, start a worker or declare installed readiness.

No signed runtime schema, producer archive format, pinned dependency policy,
host floor, worker capability or generation default is relaxed for extraction.
The existing producer is reused rather than regenerated to make a failing
archive easier to consume.

## Fresh Invoke source and adaptation boundary

The local Invoke checkout was reread clean at
`4875d96531ca6712b288f6e660fcbb34143408c1`, including actual callers:

- `invokeai/frontend/webv2/src/workbench/projects/invk/archive.ts:87–149`
  provides `createExpansionBudget` and `readArchive`. Entry count and declared
  expansion are checked in fflate's filter before buffered inflation. Stored
  entries must have equal compressed and original sizes. A saved size refusal
  is raised after unzip settles so it remains distinguishable from malformed
  input. The browser archive ceiling is 2 GiB and the entry ceiling is 20,000;
  those values describe that buffered owner, not Studio's runtime profile.
- `invk/importProject.ts:104–137` checks `File.size` before `arrayBuffer`, calls
  `readArchive`, then validates manifest and supported schema. Its
  `toSafeBasename:96` rejects separators, NUL and dot names for media.
  `workbench/projects/projectFile.ts` calls this project-import path.
- `invokeai/app/util/path_safety.py:92` checks path components and resolved
  containment. Callers include `invocations/prompt.py:117` and
  `invocations/image.py:1174`. Textual checks and filesystem containment address
  different failures; one does not replace the other.
- `invokeai/app/services/model_install/install_staging_ledger.py:611` supplies
  owned staging; marker/import callers are in
  `model_install_default.py:293,2138`. Complete claims, incomplete markers and
  source-bound ownership are the already adapted basis for Studio runtime
  publication, not a generic permission to delete abandoned paths.

Invoke's `.invk` importer is buffered browser project import. It skips directory
records and tolerates unknown project entries; it neither writes executable
filesystem payloads nor establishes trusted relative Python symlinks.
`tests/family_e2e/test_bundle.py:275` uses `extractall` for a test fixture and is
not a production extractor. No compatible signed managed-Python filesystem
extractor was found in the inspected owners. Root disclosed that absence before
the adaptation. The reusable upstream mechanisms are pre-inflation budgeting,
typed refusal order, containment and owned staging, not an unrestricted unpack
operation.

## Existing Studio owners

`src/main/projects/igs-package.ts` already adapts ZIP consumption to Node:

- `readIgsPackage:698` lazily scans entries, rejects duplicates, bounds declared
  and actual expansion, hashes streams and checks exact membership.
- `extractMemberToFile:832` streams expected bytes into an exclusive temporary
  file, checks size/hash and archive identity again, and syncs before publication.
- `openArchive:1296` uses yauzl with `lazyEntries`, `strictFileNames` and
  `validateEntrySizes`; its iterator and stream helpers preserve typed failures.
- `assertZipEntry:1448` rejects encrypted, unsupported-method and nonregular
  entries. Its complete symlink prohibition and image-specific validation belong
  to `.igs`; they cannot replace the runtime's signed symlink contract.

Actual extraction callers include `project-session.ts:363,506`,
`project-relocation-store.ts:921` and `project-layer-resource.ts:107`.
Runtime extraction adapts these streaming and refusal patterns without changing
Project package behavior, adding image checks to runtime files or copying the
Project owner's replace-existing destination semantics.

`runtime-release-transport.ts` remains the authority for outer/inner signature,
archive byte identity and complete transport snapshots.
`runtime-release.ts` remains the authority for the exact expanded inventory,
allowed Python link graph, executable semantics and payload snapshots. It
already forbids an inventory file/link from being another member's parent,
link cycles, missing targets and targets outside the Python subtree. Linux
case-distinct filenames remain distinct.

The new module is `src/main/runtime/runtime-release-extraction.ts`. Output
ownership is shared through `withRuntimeTransportOutput`, extracted from the
existing producer rather than duplicated as another installer or filesystem
publication policy. The shared owner provides a new private container,
descriptor-backed directory identity, incomplete marker and durable completion.

## Material path and completion

```text
explicit transport directory + trusted public keys + app version
→ existing verifyRuntimeTransport
→ ZIP preflight against exact signed inventory and finite metadata budget
→ bounded link-byte/CRC preflight
→ shared create-only output container, marker outside payload/
→ exclusive ordinary files with streamed size/hash/CRC checks
→ exact signed relative Python symlinks, created last
→ existing verifyRuntimeRelease on payload/
→ payload + transport + output-anchor snapshot checks
→ fsynced completion, closed readers and RuntimeReleaseSelection
```

Preflight checks exact member paths/count, duplicates, kind, mode, method,
stored-size consistency and declared expansion before output creation. Only
methods STORE (`0`) and DEFLATE (`8`) are admitted. The existing producer's
`zip-v1` writes inventory members rather than explicit directory records;
parents are inferred only from the signed inventory. Unlisted ZIP entries
cannot create directories or influence the destination tree.

Link entries are bounded and compared to the exact encoded signed target before
output creation. The extractor does not follow archive symlinks. Ordinary files
are written first, with exclusive creation and byte/hash/CRC accounting while
streaming; only then are the permitted links created. Mode checks preserve
ordinary/executable/link meaning without executing any extracted artifact.

The output container and its `payload/` child have different roles. The
incomplete marker stays in the container, because the exact runtime inventory
must contain neither that marker nor an envelope sidecar. The preserved inner
envelope is supplied to the existing verifier outside `payload/`. The output
must also stay outside the transport directory, whose verifier requires exactly
the three completed transport files.

Linux `/proc/self/fd` anchors bind output operations to owned open directories.
The yauzl archive descriptor and owned anchors have explicit lifetimes; success,
failure and cancellation must await their closure. Rechecking path text alone
does not establish that writes stayed attached to the original destination.

## Finite parameters and refusals

These are engineering guards inherited or explicitly added for this consumer,
not measured release capacity or a guarantee that every maximum-sized input
fits available memory or disk.

| Parameter / owner | Bound | Meaning |
| --- | --- | --- |
| Authenticated archive | 65 GiB | existing transport ceiling; actual archive identity checked before ZIP reads |
| Inner/outer envelopes | 1 MiB each | existing bounded trust metadata |
| Inventory and inferred tree | 100,000-entry guard | account for signed members and implicit directories; no unbounded tree construction |
| One ordinary file | 32 GiB | existing runtime per-file ceiling |
| Expanded ordinary-file total | 64 GiB | existing runtime payload ceiling |
| Signed link target | existing 1,024 JavaScript string code units | read only the exact expected UTF-8 target bytes; do not buffer an arbitrary link member |
| Cumulative ZIP metadata | 128 MiB | preflight guard, not a memory-capacity claim |
| Stream work | bounded reads | check declared and actual sizes; no whole large member/archive buffering |
| Planned execution envelope | 4 GiB, zero swap, 600 seconds | parent plus owned extraction work; actual measured resources recorded separately |
| Output | new private container and payload | existing or substituted destination refuses; marker outside exact payload |

Metadata budgeting must be cumulative while entries are enumerated, before
retaining an unbounded entry map. Declared expansion is checked before opening
member streams and actual expansion during streaming. Signed ordinary byte
totals exclude link text, whose small exact read is separately bounded.
Before buffering link text, its declared size must equal
`Buffer.byteLength(signedTarget)`; actual reads are bounded by that exact value.
The existing string limit implies a conservative 4,096-byte buffer ceiling,
not a new 1,024-byte target restriction. UTF-8 bytes must match exactly.

Cancellation is checked during bounded reads and before completion. It has a
typed cancellation outcome. Before output ownership is established, refusal
creates no output. Later refusal or cancellation may leave the owned container
marked incomplete; this does not count as a usable release. The marker remains
until all validation, snapshot and durable-completion conditions pass.

## Failure and recovery boundaries

Most structural and link refusals occur during preflight, before output
creation. Ordinary-file content hashes and final source/output snapshot fences
necessarily occur later. A malformed regular stream or late source replacement
can therefore leave private partial state; the contract must not claim that
every rejected input leaves no files.

The extractor does not resume incomplete output, recursively clean it or guess
that a path belongs to an earlier operation. A failed attempt cannot replace an
existing payload, redirect writes into a symlink target, alter the transport
source or publish a runtime pointer. Exact owned-path cleanup belongs to the
later retained-evidence and dependency audit, after all descriptors/readers have
closed. No new cross-process recovery journal or runtime lifecycle is added.

## Acceptance and sensitivity criteria

1. Extract a real previously verified 67-wheel transport through the production
   consumer. Verify exact ordinary bytes, executable flags, case-distinct
   paths and allowed link text/targets using the existing runtime verifier.
   Preserve exact inner-envelope bytes and prove source transport unchanged.
2. Refuse untrusted or changed transport before ZIP/output work. Refuse missing,
   extra, duplicate, directory, traversal, type/mode and unsupported/encrypted
   entries at the structural boundary. A valid outer signature does not excuse
   ZIP semantics that differ from the signed inner inventory.
3. Exercise entry/metadata/declared-expansion bounds before materialization,
   then streamed size/hash/CRC limits at the ordinary-file consumer. False
   headers, truncated bytes and wrong link payload must reach their intended
   refusal rather than a generic setup error or process limit.
4. Verify pre-output cancellation and cancellation during bounded extraction;
   preserve typed refusal, incomplete-state semantics and closed readers.
   Output/root replacement must never redirect writes or cleanup to unrelated
   contents. A normal neighboring extraction remains valid.
5. Sensitivity checks must reach the actual structural/content consumers with
   an adjacent GREEN and exact restoration. Record intended assertion failures
   separately from setup, import, timeout, OOM or interrupted-controller errors.
6. After the shared output-owner refactor, existing producer/trust/runtime
   neighbors retain their behavior. Required typing, focused tests, lint/build,
   source review and independent retained-byte audit are separate evidence
   levels from actual extraction and from downstream installation.

These criteria do not require another unchanged native generation matrix or
installed self-test. This boundary ends at a verified release selection that
the existing assembler can consume later.

## Execution and artifact evidence

Root executed the final local CLI against the unchanged retained 67-wheel ZIP.
**Actual final extraction PASS**, 36.412s under 4 GiB/zero-swap/600s bounds,
with confirmed physical exit. Both initial and final output trees have 3,559
signed regular files, 1,048 Python symlinks and 67 wheels, totalling 3,317,985,242
signed regular bytes. The container has its exact unchanged inner envelope
outside `payload/`, with no completion marker after success. The existing
`verifyRuntimeRelease` and both source/payload snapshot fences ran inside the
production extraction consumer; no Python/worker was started.

The group peak reached 4 GiB. Its peak sample includes 3,956,256,768 file-cache
bytes and 302,686,208 anonymous bytes; this is not a spare-memory/capacity claim.
The first actual extraction also passed before the final descriptor/cancellation
fixes; final-source execution, rather than that initial result, is delivery
evidence. No model weights or installed environment were copied.

Final checks: **40/40 new extraction/CLI selections PASS**, including signed
header/size/mode/member/type refusals, CRC/hash checks, late source drift,
cancellation, output alias/overwrite/overlap and unchanged foreign trees. Existing
release/producer/installer neighbors separately passed **148 selections**, with
one existing opt-in host test skipped. Typecheck, five-file ESLint and app build
all passed; seven source pins remained exact before/after those commands.

Source review identified two reachable issues: snapshot cancellation was relabeled
as CHANGED, and traversable nested paths could redirect writes into a substituted
foreign directory. Both were corrected before final qualification. All mkdir,
file open and symlink operations now use held no-follow parent descriptors;
visible paths detect replacement. Two actual filesystem-substitution regressions
preserve the foreign sentinel/tree and incomplete marker, reject with CHANGED
and leave no owned fd. The direct canceled-snapshot test preserves CANCELED.
The narrow independent source follow-up is CLEAN; it executed no runtime.

Two isolated semantic mutations produced six actual GREEN/RED/restoration phases:
**54 leaf selections = 50 GREEN + four intended assertion RED**, zero skips.
Bypassing ZIP mode equality allowed three wrong-mode/type leaves to reach the
actual consumer and fail with Missing expected rejection. This corpus used an
explicitly recorded artifact-copy-only fixture adapter supplying the genuine17
config bytes, held constant across all three phases; it was not a production
change or an unmodified-repository test run. Bypassing only the anchored regular
file open caused a real foreign fixture write after parent checks; the API still
refused with CHANGED, then the preservation assertion failed as intended. Positive
neighbors stayed GREEN. All four copied source files restored byte-for-byte and
all seven repository pins/17 read-only configs remained unchanged. Six bounded
units physically exited. A final executor diagnostic about a remaining tsx cache
is retained separately and is not another semantic RED or test execution.

The independent output audit passed in **12.051s**, within 4 GiB/zero-swap/600s,
with all readers/processes closed. It verified both Ed25519 signatures, canonical
payloads and detached bindings, fresh source ZIP SHA, every entry's bytes/mode/
uid/gid/link target in both outputs and seven source pins/validation receipts.
`independent-output-inventory.json` retains complete stat/hash accounting.
No payload extraction or execution was performed by that auditor.

## Retention and reconstruction

RUN: `runs/runtime-release-extraction/20261114` under the artifact root.
Source dependency: `shared/runtime-transport-fa8b9272-r1/artifact-final` and its
explicit qualification-only public keyring. The source archive remains unchanged:
SHA-256 `9b4e22af0605b13ce3a6e2a854509dcf051d2d1556a55fae88e28c7ae1c360cd`.
The new RUN is a reciprocal protected consumer; old consumers are preserved.
Initial artifact-root allocation was 38,276,550,656 bytes, with 57,938,432,000
available disk bytes. The two temporary unpack trees have a concrete validation
purpose and are scheduled for disposal after retained-byte audit. No new ZIP,
ML environment, model catalog or weight copy is retained.

Reconstruction uses the protected signed ZIP/keyring and this committed
extraction consumer into a **fresh** explicit output container; do not resume
an interrupted container or blindly extract the support archive. Incomplete
attempts are retained/refused until their owner audits and disposes them.
Download/cache admission, aggregate engine/free-space planning and LaMa remain
following consumers. Public promise statuses stay unchanged.

This stage adds no download, dependency resolver, assembler, Python execution,
worker startup/self-test, runtime activation, LaMa installation, aggregate
engine preview, public Setup, shipping publisher-key delivery, native support
matrix, visual acceptance or MVP-readiness claim.


The final independent retention audit passed in **18.249s** under the same bounded
CPU envelope, with physical reader closure. It freshly checked all **14,191 raw
entries / 6,667,984,733 regular bytes**, all **4,975 support archive entries /
30,047,309 regular bytes**, every one of 9,216 omitted entries against the
protected ZIP/inner sidecar, both output inventories and all mutation witnesses,
coverage, transcripts and restoration bytes. The fixture adapter's exact hash
was reconstructed from retained original source and executor transformation.

The support archive is **9,006,507 bytes**, SHA-256
`53238fff34c5eed915d8c199ff22a47e1395333702431e3fdc3e067955a1d61a`.
After reader release, Root rechecked complete live stat/hash membership, support
archive bytes, protected source identities and owned physical process exit.
Only `RUN/payloads` and `t-rre-1114` were removed, without following symlinks:
**6,699,020,288 allocated bytes reclaimed**. Lifecycle is `retained`, `payloads: []`.
The existing transport ZIP and all prior consumers/dependencies remain protected.
Generic inventory/archive primitive source is frozen locally for reproduction;
no disposed raw path is an implicit resume input.

`actual-source.json` binds the executed behavior files. `delivery-source.json`
also records final contracts/documentation; commit/push and committed-blob
identity are recorded separately in `commit-proof.json`. Private signing keys
were neither required nor read by extraction/audit, and are not retained here.
