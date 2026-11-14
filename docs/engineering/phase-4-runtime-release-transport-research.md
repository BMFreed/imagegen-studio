# Runtime release archive and signed transport boundary

Base: `fa8b92723b050e76e516765d661c1953bec0366b` on `master`, clean at the
initial source check. Risk: **High** — publication and authentication of an
archive containing executable runtime artifacts, plus filesystem ownership.
Supporting contracts: [runtime release artifacts](../specs/07-python-runtime-management.md#release-artifacts),
[Product Promises](../product-promises.md),
[full offline Python-slot qualification](./phase-4-runtime-offline-full-research.md),
[artifact lifecycle](./artifact-lifecycle.md). Promise statuses do not change.

This note records fresh research and finite acceptance criteria. Implementation,
tests and actual execution results must be recorded separately below. Source
authorship does not establish a produced or qualified release.

## Expected result and scope

The existing signed runtime release describes an expanded directory: exact
Python/uv/config/wheel files, permitted Python symlinks, worker versions, host
requirements and installation policy. Its `files` inventory is not a compressed
transfer artifact. Summing that inventory cannot establish an archive download
size, and repeated basenames cannot simply become flat engine-artifact entries.

The next material consumer produces one real ZIP from that already verified
expanded payload and a detached, authenticated transport descriptor. The
descriptor binds the exact completed archive bytes to the exact existing inner
envelope bytes. This establishes a producer/transport boundary before aggregate
engine planning, auxiliary LaMa installation or public Setup.

The producer requires an explicit publisher private-key file and key ID. There
is no generated fallback key, bundled private key or implicit trust-on-first-use.
An isolated qualification may supply an explicit run-only key; doing so proves
the same signing mechanism with that key, not shipping publisher-key delivery.

## Fresh Invoke source and applicability

The local Invoke checkout was clean at
`4875d96531ca6712b288f6e660fcbb34143408c1`. Relevant implementations and callers
were reread for this change:

- `scripts/family_e2e/bundle.py:332` (`write_bundle`) calls `_write_zip` at
  `:387`. The writer creates a same-directory temporary file, closes the ZIP
  before `os.replace`, and unlinks its exact temporary path in `finally`.
  It uses DEFLATED text and stores already compressed files. Caller
  `scripts/family_e2e/__main__.py:261–266` checks that the run's runner is gone
  before invoking the writer. Reusable mechanisms are completed-archive
  publication and intentional compression choices. Its whole-file `read_bytes`,
  PNG rewriting, report sanitization and report-specific member selection are
  unsuitable for byte-exact multi-gigabyte runtime payloads.
- `invokeai/backend/model_hash/model_hash.py:208–232` implements streamed
  hashlib hashing with a fixed buffer. `ModelOnDisk.hash` in
  `invokeai/backend/model_manager/model_on_disk.py:124` calls that owner.
  This supplies the bounded streaming mechanism. Directory `ModelHash` filters
  model-weight suffixes and combines component hashes, so it cannot establish
  the identity of a complete runtime tree or replace its existing inventory.
- `invokeai/app/services/model_install/install_staging_ledger.py:114`
  publishes a completed claim through a temporary file, fsync and no-replace
  publication. Its marker and staging callers remain in
  `model_install_default.py:293,960,2138`. `install_path:960` protects a source,
  probes it and enters the existing transfer/claim path. Callers include
  `invokeai/app/api/routers/model_manager.py:136,998`. These are ownership and
  model-transfer mechanisms, not runtime archive extraction or release signing.

No compatible signed managed-Python release producer or transport attestation
was found in those Invoke owners. Root disclosed this missing mechanism before
the extension. The adaptation reuses Invoke's archive publication and stream
hashing patterns and Studio's existing output/trust owners. It does not silently
replace an available upstream runtime installer. The new transport descriptor
is the Studio-specific contract needed to connect an actual archive to the
already implemented signed expanded release.

## Owners and material path

The planned production module is
`src/main/runtime/runtime-release-transport.ts`. It owns archive production and
bounded canonical transport verification. The existing Ed25519 envelope
primitive and runtime manifest validation are shared from
`src/main/runtime/runtime-release.ts`; the inner manifest schema and its
meaning stay unchanged. `verifyRuntimeRelease` and
`verifyCompletePayloadSnapshot` remain the expanded-payload authorities.

`scripts/produce-runtime-transport.mjs` is a build-time CLI over that owner. Its
inputs are an explicit payload directory, inner envelope, trusted public-keyring,
app version, publisher private-key file and key ID, plus a new output directory.
These are trusted build inputs, not renderer-provided resource paths or keys.
The CLI must not resolve dependencies, choose an alternate release, provision a
runtime or generate a signing key when required inputs are absent.

Studio already supplies create-only publication in
`scripts/produce-runtime-wheelhouse.py:70–145`: canonical parent and output
identity, a private new output directory, exclusively created files, an
incomplete marker and fsync before completion. Its ownership pattern is adapted
for this producer. Invoke's overwrite-oriented `os.replace` does not authorize
replacing a pre-existing Studio release output or deleting a substituted path.

The material path is:

```text
explicit trusted inner envelope + expanded payload
→ existing signature/manifest/inventory verification
→ source snapshot retained through streaming archive construction
→ completed ZIP, exact archive size and SHA-256
→ detached canonical descriptor bound to exact inner-envelope bytes
→ explicit publisher-key signature
→ transport verification and unchanged expanded-payload snapshot
→ fsynced create-only output completion
```

The descriptor records the archive's actual format/name, byte count and digest,
the exact inner-envelope digest and bound release identity, plus actual member
and expanded-byte accounting. Exact schema fields belong to the module; this
note does not introduce a second permissive metadata interpretation.

## Detached binding and trust

The existing inner envelope is preserved byte for byte. The archive contains
only its expanded inventory, with no transport descriptor or signature inside
it. The inner envelope and outer signed descriptor are sidecars outside that
inventory. The outer descriptor covers the final archive bytes and the exact
inner-envelope bytes; it does not hash an archive that contains its own hash.
This avoids a self-reference cycle without changing the inner release schema.

Both signatures must be verified using the explicitly supplied trusted public
keys. A valid outer signature cannot make an invalid or different inner release
acceptable. A valid inner release cannot authenticate an archive with a missing,
untrusted or mismatched outer descriptor. Key ID, algorithm, canonical JSON,
bounded envelope size and exact descriptor fields are part of the refusal
boundary. Sharing the existing Ed25519 primitive preserves its current checks;
it does not create a second expanded-payload verifier.

Private-key contents must not appear in the archive, descriptor, progress
output, report or error diagnostics. The producer must not add local build/input
paths to published member names or transport metadata; this does not authorize
rewriting exact signed binary payloads. The explicit test key and the inner
qualification key remain distinct from any shipped publisher trust root.
Re-signing an existing qualification envelope does not promote its host policy
or prior runtime results to release acceptance.

ZIP members must preserve the signed relative paths, exact ordinary-file bytes,
executable semantics and allowed relative Python symlink targets. Symlinks must
not be followed into other data. Metadata normalization or compression must not
rewrite payload contents. The completed archive's measured bytes are the
transport identity; deterministic reproduction across tool versions or hosts
requires separate evidence and is not assumed from using ZIP.

## Finite parameters

These are engineering refusal bounds, not release support or storage capacity
guarantees. Existing runtime limits are reused rather than silently widened.

| Parameter / owner | Bound | Meaning |
| --- | --- | --- |
| Inner and outer envelopes | 1 MiB each | bounded metadata before signature/JSON processing |
| Expanded inventory | 100,000 entries | existing runtime inventory ceiling |
| One ordinary payload file | 32 GiB | existing per-file refusal |
| Expanded ordinary payload bytes | 64 GiB | existing aggregate payload ceiling |
| Completed archive | 65 GiB | engineering guard allowing 1 GiB beyond payload bytes; not a promise that every allowed tree fits |
| Hash/copy/archive input | bounded streams | no whole-archive or whole-large-file buffers |
| Output directory | new, private `0700` | existing output refuses; incomplete state cannot become a published release |
| Publication | complete files, fsync and output identity | failure must not delete or overwrite external data |

ZIP headers, names, symlink encodings and compression overhead count against the
actual archive ceiling. The 1 GiB difference is a finite guard, not a measured
worst-case expansion allowance. Archive production must refuse if a bound is
reached. Archive size is not installed footprint, unpack scratch, free-space
peak or full engine download size. LaMa and shipping artifact delivery remain
outside this descriptor's Python-release scope.

## Failure, interruption and regression criteria

Acceptance must exercise the production module and CLI with actual archive
bytes, not just a constructed descriptor:

1. A valid explicitly signed input produces an archive and detached descriptor;
   the real transport consumer verifies the exact archive/envelope binding.
   Recorded bytes, member accounting and identities agree with the actual
   archive, and the inner envelope remains byte-identical.
2. Missing or invalid publisher key/key ID, untrusted inner/outer signature,
   noncanonical or malformed metadata and identity mismatches refuse. No
   generated key or arbitrary alternate artifact can turn refusal into success.
3. Archive byte drift, including same-length drift, and a borrowed valid inner
   envelope refuse at the intended consumer. Each sensitivity check needs a
   neighboring valid control and exact restoration; setup errors are not
   semantic detection.
4. Source replacement or modification during production refuses through the
   existing snapshot/inventory checks. Signed symlinks remain links to their
   exact allowed targets; executables remain distinguishable. Unexpected,
   nonregular or escaping entries cannot be silently archived as valid payload.
5. Existing output, changed parent/output identity and interrupted/failed writes
   cannot publish completion or overwrite an unrelated path. Incomplete output
   is explicit. Cleanup only addresses proven owned temporary entries and never
   recursively deletes an external or substituted directory.
6. Existing signed-release validation, offline assembly and default CPU/refusal
   neighbors preserve their contracts after the shared-envelope refactor.
   Required TypeScript checks, scoped tests, lint/build and source review remain
   separate evidence from the real archive result.

This is not an all-or-nothing transaction across artifact download, auxiliary
installation and runtime activation. No such operations occur here. A failed
producer may leave an owned incomplete output for diagnosis, but cannot change
an active runtime pointer, previous runtime, model library or Project.

## Evidence and artifact plan

Root executed the final source through the real CLI using reconstructed existing
signed runtime inputs and all 67 verified wheels. The initial command correctly
refused a mismatching application version before creating output. The final CLI
completed in **25.069s**, under 4 GiB/zero-swap/600s bounds, with peak
3,652,268,032 bytes (the peak sample includes 3,219,640,320 file-cache bytes).
Its archive contains **4,607 members**: 3,559 regular files and 1,048 relative
Python symlinks; signed regular payload bytes total **3,317,985,242**.

Actual ZIP: **3,218,614,866 bytes**, SHA-256
`9b4e22af0605b13ce3a6e2a854509dcf051d2d1556a55fae88e28c7ae1c360cd`.
Both complete producer attempts emitted byte-identical ZIPs and unchanged inner
envelope bytes. Outer envelope field order changed during lint normalization;
raw outer bytes are retained separately. Canonical signed payload, signature and
publisher identity remain the same; outer envelope field order is not canonical
in the existing contract. Independent audit must verify both signatures and the
exact ZIP/inner identities rather than silently normalize a signed payload.

The original inner envelope is unchanged and keeps its previous qualification-only
key semantics. A separate outer Ed25519 key was explicitly supplied through the
same required CLI key-file inputs used by a release builder. The producer does
not create a key or trust root. The temporary qualification private-key file was
disposed after all producer processes exited; no private bytes are in the output
or retained evidence. Only public verification identities and signed sidecars
remain. This is not a shipped publisher identity or official release artifact.

Final focused checks: **187 PASS, one explicit existing opt-in host-test SKIP**.
The suite covers both signed envelope layers, exact artifact hashes/sizes,
borrowed envelopes, wrong keys/algorithms, malformed/extra/incomplete metadata,
symlink/overwrite/overlap refusal, snapshot replacement, independent ZIP members,
CLI secret-input diagnostics and preserved original runtime installer neighbors.
The default host path was not rerun natively in this producer-only stage.
Typecheck, five-file ESLint and app build all passed after final fixes.

Source review found a real lazy-stream error propagation defect. The first fault
regression returned an unexpected error class instead of the required refusal;
descriptor-close ownership was then corrected.
The corrected stream has one async-iterator owner per input fd, explicitly forwards
errors and waits for teardown. The actual same-length source mutation after
initial signature/payload verification now rejects with CHANGED, keeps incomplete
output without an outer receipt, restores source bytes and passes a healthy
neighbor in the same process. Initial compile/style failures are retained as
failed attempts, separately from final successful validation.

Two isolated semantic mutations ran against the actual transport consumer:
bypassing the inner-envelope digest comparison, and bypassing the ZIP digest
comparison. Six GREEN/RED/restoration phases contain **36 leaf selections =
33 GREEN + three intended semantic RED**, with zero skips. Every RED is the exact
missing-expected-rejection assertion, with size/other-binding controls still
GREEN. TAP/JUnit and coverage/witness bind the real copied consumers. Source and
backup copies were restored exactly; all six bounded units physically exited.
Maximum mutation peak was 69,357,568 bytes under 4 GiB/zero-swap/600s.

The independent source follow-up is CLEAN; it did not execute producer/runtime
work. The independent artifact audit passed in 9.203s: both signatures/canonical
payloads, exact detached bindings, all 4,607 ZIP members, all reconstructed input
identities and final source pins. Its initial raw-outer equality expectation
refused the permitted field-order delta; that FAIL and the two raw encodings are
retained. No ZIP, inner identity or signature condition was waived.

A separate independent retention audit passed in 15.405s: fresh no-follow hashes
and stats for all 9,365 temporary entries, every compact support member, every
omission mapping to the protected ZIP, and mutation restoration/transcript/
coverage bytes. Both audit units used 4 GiB/zero-swap/600s and physically exited;
all readers closed before cleanup. Source review, artifact audit and retention
audit are separate from the actual CLI producer and earlier native work. No image inference, new Python-slot assembly, native
qualification, LaMa installation, complete engine review, transport extraction,
network delivery, public Setup or readiness promotion is claimed here.

## Retention and next consumer

RUN: `runs/runtime-release-transport/20261114` under the artifact root.
Only the existing signed source inputs were reconstructed; no installed runtime,
checkpoint/model weights or new dependency environment was copied. Initial root
allocation was 35,040,530,432 bytes, available disk 61,206,011,904 bytes; GPU
1,485 MiB used/14,535 MiB free (no GPU work was required).

One complete final ZIP and its signed sidecars are retained at
`shared/runtime-transport-fa8b9272-r1/artifact-final` for the next concrete bounded
extraction consumer. Its keyring is explicitly qualification-only. This is a
necessary single transfer artifact, not another installed runtime. The initial
ZIP copy and expanded test source are temporary; complete stat/hash inventory
and small non-reconstructible mutation/support bytes must be retained before
removal. Source inputs can be reconstructed from the preserved ZIP only through
an explicit bounded/safe extraction or reviewed reconstruction, not blind archive
extraction. The production extraction consumer remains a separate required gate.

Do not start a new download, claim a full engine preview, or wire the public Setup
button merely because this producer succeeded. Real transfer bytes now exist;
the following owner must verify them before bounded unpack and reuse the existing
inner payload verifier and offline assembler. Aggregate planning must use actual
transport bytes plus pinned LaMa, retain unknown installed footprint and account
for publisher/unpack/old-slot disk peaks separately.


After independent reader release, Root freshly rechecked all raw hashes/stats and
retained support bytes, confirmed owned physical process exits and removed only
`RUN/payloads`, `t-rrt-1114` and the superseded initial `SHARED/artifact`.
**6,588,092,416 allocated bytes were reclaimed.** Final transport bytes remain
protected at `SHARED/artifact-final`; no existing ML runtime, models or canonical
wheelhouse were removed. Both lifecycle records are `retained`; this RUN has
`payloads: []` and reciprocal dependencies remain explicit.

`payload-inventory.json` distinguishes complete raw accounting from the selected
support archive. The support archive retains 4,756 entries / 29,775,494 regular
bytes, including the initial raw outer envelope; compressed size 9,035,607 bytes,
SHA-256 `df92ca6b1b0675438a9ab74ec418cf9a32ed6d02601cf6b0cc69ccd66f7899d8`.
Every omitted source/initial byte is present exactly in the protected final ZIP
or its unchanged inner sidecar. Compact mutation, validation, initial failures,
public trust and source receipts remain independently distinguishable.
`commit-proof.json` records actual delivery and matching committed source blobs;
`delivery-source.json` includes the final documentation and unchanged behavior
files from `actual-source.json`. No private signing material is retained.
