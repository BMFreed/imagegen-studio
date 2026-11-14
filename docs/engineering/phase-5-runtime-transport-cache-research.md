# Trusted runtime transport download and cache

Base: `21269161` on `master`. Risk: **High** — network destinations,
authentication of executable artifacts, cache publication/reuse and filesystem
ownership. Supporting contracts: [runtime management](../specs/07-python-runtime-management.md),
[PP-001](../product-promises.md#pp-001-понятный-интерфейс-вместо-собираемого-workbench),
[release transport](./phase-4-runtime-release-transport-research.md),
[bounded extraction](./phase-4-runtime-release-extraction-research.md) and
[artifact lifecycle](./artifact-lifecycle.md). Public promise statuses remain
unchanged.

This is the research and acceptance plan for a finite Main-owned consumer.
The settled API/layout is recorded below; actual validation/test counts,
network/byte evidence, resources, reviews and lifecycle results remain explicit
completion records. No execution success is inferred from this document.

## Expected result and trusted inputs

The signed transport producer and bounded filesystem extractor already exist.
They do not obtain a release from a publisher or establish verified cache reuse.
The next consumer joins the existing network downloader to that transport
boundary, without introducing another HTTP implementation, payload verifier,
installer or worker.

Main supplies both signed envelope byte sequences, the external trusted public
keyring, app version, an exact archive source URL and a finite list of permitted
redirect origins. These are trusted Main/build inputs. They do not arrive from
renderer IPC, a model-import form, an untrusted archive member or a downloaded
keyring. The consumer authenticates both envelopes and their bindings before
DNS, HTTP or filesystem writes.

Source URL and redirect-origin selection remain an external release-selection
responsibility. The current signed transport descriptor authenticates artifact
bytes and the inner release; it does not contain a shipping URL selection
policy. This stage must not invent a production release endpoint, publisher
key, metadata-discovery service or fallback source. A test source/keyring proves
only the explicitly executed qualification path.

## Fresh Invoke source and actual callers

The local Invoke checkout was reread clean at
`4875d96531ca6712b288f6e660fcbb34143408c1` for this stage:

- `invokeai/app/services/download/download_default.py:425–620` provides the
  HTTP download path: streaming response, progress, cancellation, partial-file
  handling and completed-file publication. `_validate_url:650` and
  `_reject_unsafe_redirect:654` validate the initial URL and redirect hops.
  `_download_next_item:389` invokes one download attempt and delivers terminal
  error/cancel/pause callbacks; it is not an arbitrary HTTP retry/backoff loop.
- `invokeai/app/util/ssrf.py:187,238,249,270,330` supplies URL validation,
  guarded socket connections and the guarded session. Its actual caller is
  `DownloadQueueService.__init__` in `download_default.py`. Injected unguarded
  test sessions require an explicit test trust decision; production connection
  policy is not bypassed by supplying a mock transport silently.
- `invokeai/app/services/model_install/model_install_default.py:1549–1603`
  serializes cache downloads by source and checks the cache again after taking
  the per-source lock. This prevents overlapping writers. Its existing-cache
  fast path returns the first directory entry without checking hash or signed
  identity, so that fast path cannot qualify a Studio runtime cache.
- `invokeai/app/services/shared/invocation_context.py:756,800–824` calls the
  installer cache and then the model loader. A concrete consumer is
  `invokeai/app/invocations/infill.py:134–143`, which requests the shared LaMa
  resource. That call graph confirms the separation between obtaining a shared
  artifact and consuming it; it does not turn LaMa into runtime setup policy.
- Explicit restart callers are
  `invokeai/app/api/routers/model_manager.py:1283,1309`, delegating to
  `restart_failed`/`restart_file` in `model_install_default.py:1340,1356`.
  `_enqueue_remote_download:2184` only continues recorded partials with a
  validator. `download_base.py:213–249` selects ETag or Last-Modified for
  `If-Range`; missing validators or refused continuation restart from zero.
- `invokeai/app/services/model_install/install_staging_ledger.py:189,452,611`
  supplies durable markers and source/revision-bound staging reuse;
  `HeldClaim:321` owns active claims. Callers include marker updates and remote
  import/enqueue in `model_install_default.py`. Partial resume depends on that
  recorded identity, ownership and recovery path, not just a Range header.

No compatible signed managed-Python runtime download/cache consumer or shipping
release-selection/keyring mechanism was found in those Invoke owners. That
missing boundary must be disclosed before the Studio-specific extension. The
adaptation takes streaming destination checks, bounded transfer, ownership and
cache recheck from the available mechanisms, then uses Studio's existing signed
transport verification. It must not copy Invoke's unverified first-entry cache
reuse or independently invent a parallel download/installer stack.

## Existing Studio mechanisms and constraints

`src/main/models/model-downloader.ts` already adapts the network owner to Node:
DNS/public-address checks, socket-address pinning with TLS hostname validation,
manual redirects, header/idle/total timers, byte backpressure, exact streamed
size/SHA-256, cancellation and private partial-file cleanup.

Its current source union admits only `anima-huggingface`, `civitai`,
`invoke-lama` and `invoke-regional-reference`. A runtime archive cannot be
misrepresented as one of those sources or admitted through arbitrary renderer
URLs. The runtime-specific trusted seam must reuse the same network owner and
preserve existing source admission, authorization-header and size behavior.

The ordinary model download ceiling is 32 GiB, while the existing signed
runtime archive ceiling is 65 GiB. Runtime-specific admission must retain that
distinction; it cannot silently widen model-source limits. Runtime transfer
requires signed exact size/hash rather than the optional expectations supported
by some existing model-import paths.

`runtime-release-transport.ts` remains the authority for canonical outer/inner
signatures, descriptor bindings, the exact three-file transport group and
complete snapshots. Authentication of the supplied envelope bytes is shared
from that owner before downloading; cache publication/reuse later invokes the
same complete verifier. Metadata parsing must not duplicate a more permissive
descriptor or inner-manifest interpretation.

The finite API is `cacheRuntimeTransport` with `cacheDirectory`,
`runtimeEnvelope`, `transportEnvelope`, `appVersion`, `trustedKeys`,
`source: { url, redirectOrigins }`, and optional `signal`/`onProgress`.
An injected `downloader` is an internal test seam, not renderer-controlled
production transport. `cacheDirectory` names one exact entry container, not a
catalog root or an authority to select/delete other entries.

The existing descriptor-backed `withRuntimeTransportOutput` owner remains the
basis for exclusive container creation and durable completion. Its excluded
source-directory argument may be null for this envelope-buffer input path;
no fictional source directory is substituted. During publication the marker
is at the container root and the `transport/` child holds the exact group:
`runtime-payload.zip`, `runtime-release.json` and `runtime-transport.json`.
The completed container contains exactly `['transport']`. The marker is outside
the transport group, so verification need not ignore unexpected files.

## Material path and verified reuse

```text
trusted Main envelopes + keyring + exact source/redirect-origin policy
→ existing envelope/manifest/descriptor authentication
→ canonical owned cache lookup and complete-cache re-verification
→ hit: exact selected transport + fresh snapshot, no HTTP transfer
→ miss: owned incomplete publication + existing single-attempt downloader
→ signed exact archive size/hash and preserved envelope bytes
→ existing complete transport verification and snapshot fences
→ durable cache completion and verified transport result
```

Authentication precedes DNS and writes even when an invalid request could have
failed later at an endpoint or directory. Redirect origins must be explicit,
finite and normalized under the existing HTTPS safety policy; no wildcard,
private-address opt-out or renderer-controlled allowlist is introduced. Every
hop still receives destination and socket policy checks. No CivitAI credential
or publisher private key belongs on runtime archive requests.

A cache hit requires complete byte verification under the current trusted
keyring, app version and selected envelopes. File presence, same byte count,
cached HTTP validators, an earlier receipt or a previous success are
insufficient. A completed entry for another valid release is not the selected
release. Cache use remains advisory storage reuse; the signed bytes are the
source of truth.

Per-entry promise serialization is followed by a fresh cache check, adapting
Invoke's lock-then-recheck mechanism. A second operation can reuse the first
operation's complete verified entry; it cannot overlap that entry's writes.

An incomplete or invalid cache entry cannot become ready by trusting a marker
or reusing a partial. Failure retains the incomplete container and subsequent
reuse refuses; the caller may explicitly select a new attempt directory. The
finite consumer does not guess ownership, evict/delete old entries, resume a
partial or add crash recovery. That is a prerequisite boundary for a future
managed cache catalog, not delivered end-user Repair. Output substitution and
invalid completed contents must likewise preserve prior usable cache/data and
refuse at their actual ownership/verification boundary.

## Retry, cancellation and finite bounds

This stage preserves a single HTTP attempt. A caller may retry an operation,
and a complete verified cache can avoid another transfer, but no automatic
backoff count, Range continuation or durable partial resume is added. Those
features require the full Invoke validator/source/claim adaptation before they
can be promised. A restart from zero is not silently described as resume.

Cancellation applies to header wait, active streaming, verification and
the guard before durable completion. Like Invoke's final partial-file rename
(`download_default.py:614–618`), the completion commit may win after that last
cooperative guard; late cancellation does not implicitly delete a completed cache. The existing downloader owns request/body shutdown and partial
cleanup; cache ownership owns the surrounding incomplete state. Cancellation
must settle actual readers/writers before reporting completion. A failed or
canceled download cannot overwrite an existing complete transport or mutate an
active runtime pointer, model library or Project.

The starting bounds are the existing network policy and signed runtime limits.
Any implementation-specific narrowing or metadata/list budget must be recorded
and tested explicitly rather than inferred from the following defaults:

| Parameter / owner      | Existing bound or policy     | Meaning                                                         |
| ---------------------- | ---------------------------- | --------------------------------------------------------------- |
| Signed envelopes       | 1 MiB each                   | authenticate bounded metadata before network/output work        |
| Runtime archive        | 65 GiB                       | existing transport ceiling; signed exact size/hash required     |
| Ordinary model sources | 32 GiB                       | preserved separate downloader ceiling                           |
| Redirect origins | at most 32 unique HTTPS origins | detached trusted Main list; empty list forbids redirects; initial URL is separately admitted |
| Redirects              | at most 5                    | existing downloader guard, plus finite trusted origin admission |
| Header wait            | 20 seconds by default        | existing controlled/injectable timeout                          |
| Body idle wait         | 60 seconds by default        | bounded lack of progress                                        |
| Whole download         | 24 hours by default          | existing network owner; not a new qualification deadline        |
| HTTP attempts          | one                          | caller retry and verified complete reuse remain explicit        |
| Input/output work      | bounded streams and metadata | no whole archive/model buffering                                |

Archive bytes do not establish installed footprint, extraction scratch, full
engine download or sufficient free-space peak. The implementation must preserve
finite checks and actual resource admission without presenting a guessed
aggregate capacity or release hardware guarantee.

## Acceptance and sensitivity plan

1. Invalid/untrusted outer or inner envelopes, mismatched bindings, invalid
   source policy and unsupported app version refuse before DNS, HTTP and cache
   writes. Observe those actual boundaries rather than checking only error text.
2. A valid miss reaches the existing streamed network consumer, preserves exact
   signed envelope bytes and produces a complete transport admitted by the
   existing verifier. Record actual transferred bytes, requests and destination
   policy. A substituted local transport is distinct from real public HTTP/TLS.
3. A fresh cache lookup independently rehashes the whole group, matches the
   selected envelopes and performs no network request. Same-length archive
   drift, envelope drift, wrong release and incomplete state must refuse or
   follow the explicitly implemented recovery policy; none can silently reuse.
4. Exercise unlisted redirects, private/nonpublic DNS answers, redirect budget,
   status/header size disagreement, streamed size/hash mismatch, early EOF,
   transport failure and cancellation. Refusal must preserve foreign data and
   previously valid cache artifacts while releasing owned readers/writers.
5. Verify concurrent/overlapping cache operations and output substitution at
   their real ownership boundary. An incomplete attempt is not a complete cache
   hit, and no cleanup follows a replaced path into unrelated data.
6. Semantic mutations must reach the actual source/byte/cache consumer and fail
   the intended assertion, with adjacent GREEN and exact restoration. Setup,
   import, network availability, OOM and timeout failures are not semantic RED.
7. Existing model/LaMa/regional-reference downloader neighbors, signed transport
   verification and extraction retain their contracts. Required typing,
   focused tests, lint/build, source review and independent retention audit
   remain separate from actual download/cache evidence.

## Evidence and lifecycle checkpoint

**Authoring only:** this note's author performed fresh source research and
documentation. No tests, network request, cache operation or artifact mutation
were executed for this note. The API/layout above records the settled finite
design; all actual counts, request traces, significant failures,
controls/restoration, resources, reader closure and review outcomes remain
pending Root's execution records.

Material qualification should reuse the existing verified archive as a read-only
input where it satisfies the selected test boundary. A real cache copy has a
concrete reason only when the publication/reuse behavior itself is tested.
Do not copy an installed runtime or model weights to prove this network/cache
stage. Test endpoints and public metadata must not be presented as shipped
publisher source selection, and no private signing key is needed by the runtime
download consumer.

Root must inventory disk usage, admit bounded process resources and record
source/cache dependencies before substantial transfer or copy. Retain compact
source identities, supplied public metadata, archive hash/size, request/progress
traces, cache hit/miss and refusal evidence, restoration and physical reader
closure. Precise payload disposal follows retention/dependency audit; protected
shared archive/wheelhouse inputs and reciprocal dependencies remain intact.
Actual retained bytes, reclaimed space, validation and commit/push proof are
completion records rather than assumptions in this plan.

This stage does not perform publisher metadata discovery, ship URLs/keyrings,
extract or assemble a runtime, execute Python or a worker, activate an engine,
install LaMa, expose public Setup/Repair, calculate the full engine preview or
qualify a native support matrix, visual quality or MVP readiness.

## Root execution and final source

RUN is `~/.codex/artifacts/imagegen-studio/runs/runtime-transport-cache/20261114`.
Protected dependency is `shared/runtime-transport-fa8b9272-r1`; its reciprocal
lifecycle reference is retained. No installed environment, model weights, active
runtime pointer, Project or generation default was changed.

The final eight-file Main/tool selection passed **361 TAP tests, zero failures,
zero skips** (`focused-final`, 2.837s). It includes both changed owners, existing
model/auxiliary controls, signed release/transport verification, extraction and
producer/extractor argument checks. `pnpm run typecheck` passed in 24.499s;
scoped ESLint on all five changed TS files and `pnpm run app:build` passed.
UI/worker sources were unchanged, so no prototype/native-inference/Python typing
qualification was claimed or repeated. Build retains its existing large-chunk
advisory.

The new cache suite passed 39 cases, including root/child substitution, retained
foreign files and physical descriptor closure. Source review found that a
canceled queued request could wait for the active transfer. The implementation
now settles that caller promptly while retaining its FIFO gate until the owner
finishes. The A/B/C test observes that the third request cannot overtake the
first and then obtains verified reuse with one download.

Intermediate evidence remains explicit: `cache-tests-r2` exposed an incorrectly
nested authored FD subtest; Root corrected the test structure before r3/final.
The first scoped lint identified 55 autofixable style errors; the final pass is
clean. ESLint sorting also invalidated a test's assumed alternate envelope key
order. Root changed that control to a valid whitespace-only outer encoding.
That failed baseline is excluded from semantic RED evidence and retained in
`mutation-excluded-attempt.json`.

Final semantic sensitivity uses two separate mutants in the real cache path:
removing the archive SHA comparison admits the forged downloader bytes and
same-size corrupt cache; removing selected outer-envelope identity admits a
valid differently encoded envelope for the wrong selection. Both produce the
intended missing-rejection RED, with cold-cache controls GREEN, adjacent GREEN
and exact restored source hashes. `mutations.json` keeps all six final runs;
its TAP counts include grouped parent nodes and are not six independent defects.
No setup, timeout or OOM result substitutes for these semantic failures.

### Actual full transport consumer

After the final source/style corrections Root repeated the cold transfer with
seven freshly retained source pins (`actual-source-final.json/tar.gz`).
`actual-cache-final` passed in **13.331s** under 4 GiB/zero swap/600s, with peak
3,683,459,072 B (mostly file cache). The initial r1 is separately retained; the
final run, not an inferred source equivalence, is the delivery execution.

The existing ModelDownloader streamed **3,218,614,866 bytes** from a controlled
loopback HTTPS server into a distinct material cache file. Signed SHA-256 is
`9b4e22af0605b13ce3a6e2a854509dcf051d2d1556a55fae88e28c7ae1c360cd`.
Cold download/group validation took 10.726s; the fresh full-byte cache hit took
1.844s and issued no HTTP or DNS request. A second transfer was explicitly
canceled after progress; the partial was removed, marker/empty child remained,
and retrying that incomplete entry refused without another request. Normal
server/reader shutdown and physical unit exit were observed.

This test uses explicit public-source/DNS admission with the downloader's test
transport routing to the owned TLS server. The existing pinned HTTPS request
performs actual socket/TLS/test-CA checks. This is controlled transport evidence,
not qualification of a public publisher endpoint, production DNS or shipped
catalog/key distribution. The retained public keyring is qualification-only.
No Python environment, CUDA operation or inference was executed in this stage.

### Independent byte audit and source review

An independent assigned audit passed 16 checks on both initial and final outputs.
For the final source it streamed both source/cache archives, verified both
Ed25519 signatures/canonical payloads with the external public keyring, checked
exact sidecars and all seven retained source pins. The ZIP directory has 4607
entries and 3,317,985,242 regular expanded bytes; 1048 bounded Python link payloads
match the inner inventory. Ordinary ZIP member contents were not inflated by
this audit. Its 3.581s bounded process exited physically with zero swap; actual
HTTP execution remains Root's evidence. `independent-cache-audit-final.json`
records this distinction.

Final source/contract review was CLEAN for the finite consumer and unchanged
public statuses. The downloader portion includes its author's self-review;
Root separately inspected its shared loop and existing guards. Cache/transport
review, authored tests, Root execution and independent byte audit remain distinct.

### Retention and disposal

Compact reports, exact source, harnesses, semantic controls/restoration and
payload inventory are retained. The two identical temporary archive copies can
be reconstructed only from the explicitly pinned protected Shared ZIP; hashes
do not replace that dependency. The retained support archive preserves remaining
sidecars, markers and the 17-config fixture. No additional runtime or weights
were copied. Final cleanup and commit/push receipts are recorded below after
the dependency/reader checks; no unfinished cleanup is inferred from this plan.

Reconstruction uses a new lifecycle-owned run/attempt; do not resume disposed
`payloads` or TMP paths. Verify the retained support archive/inventory and the
protected Shared ZIP/sidecars/public keyring first. The retained final harness
and source tar identify the exact consumer and `qualification-0.1.0` app version.
Create a fresh `payloads/` parent before the controlled TLS harness; recover the
17 individually pinned configs with retained `prepare-config.py` only if the
focused extraction neighbors are repeated. These are read-only input files,
not another Python environment or model copy. Public endpoint acceptance and
end-user Install/Repair still require their own consumers.

The independent retention audit passed **15 checks**: exact 90 archived entries,
all 92 live inventory entries, omitted ZIP reconstruction dependencies, original/
final source tars and restored source hashes. The retained support archive is
2,477,297 B, SHA-256
`cfef61363ae47d1a7a57f43cee2eb72ed1c2b1ca0cb2441f53b3d218cf8084dd`.

After all readers/owned units closed and mutations were restored, Root removed
only `RUN/payloads` and artifact-root `t-rtc-1114` through the existing fd-based,
no-symlink cleanup pattern. **6,445,797,376 allocated bytes** were reclaimed;
measured artifact-root allocation fell from 44,748,009,472 to 38,302,212,096 bytes,
with the same exact delta. `cleanup.json` and its zero-swap/physical-exit companion
record the completed operation. Lifecycle is `retained`, `payloads: []`.
Shared ZIP/models/runtime/wheelhouse and public-key companions remain protected;
the source ZIP is needed to reconstruct omitted archive bytes and to feed the
following managed release/engine consumer. This stage does not authorize their
deletion. Final `commit-proof.json`/`release-result.json` bind the delivered
commit and remote head to the source/evidence set.
