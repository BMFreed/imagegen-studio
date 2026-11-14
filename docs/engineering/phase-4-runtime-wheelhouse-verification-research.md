# Locked wheelhouse bytes and metadata verification

Base: clean master `ac7f25141bccfb529c0ea9317e5dc02b5078d15b`.
High risk: a producer verdict must not accept different executable artifacts,
silently shrink the dependency set or publish a partial result as verified.
Supporting contracts: [runtime delivery](../specs/07-python-runtime-management.md#release-artifacts),
[wheelhouse selection](./phase-4-runtime-wheelhouse-plan-research.md),
[signed dependency policy](./phase-4-runtime-dependency-policy-research.md),
PP-001/004/007/008. Public promise statuses remain unchanged.

This finite change verifies a locally supplied wheelhouse against a freshly
generated plan and the actual selected wheels' Core Metadata. It does not
install or execute those wheels, produce a signed complete release, deliver
CPython/uv/config/LaMa or expose public Setup. Wheel-only byte totals are not a
complete engine download/install preview.

## Fresh Invoke source and disclosed extension

InvokeAI revision `4875d96531ca6712b288f6e660fcbb34143408c1` was reread with
material callers:

- `invokeai/backend/model_hash/model_hash.py:208`, `_get_hashlib`, supplies
  streaming SHA-256 with a128KiB memoryview buffer. `ModelOnDisk.hash` in
  `invokeai/backend/model_manager/model_on_disk.py:124` calls it; model config
  creation in `configs/factory.py:886` and `ModelInstallService._probe` in
  `model_install_default.py:2009` supply the import caller chain. Computing a
  hash alone does not compare it with a locked expected value.
- `invokeai/app/services/download/download_default.py:425–620`, `_do_download`,
  streams100,000-byte chunks to `.downloading`, checks remaining disk space and
  promotes the temporary download. `ModelInstallService._import_remote_model`
  and `_multifile_download` call the download queue; completion returns to the
  existing install owner. This source does not enforce a locked SHA-256 and
  exact expected size: equal server-reported size may count as complete and
  the final length check catches underflow. Its completion status is not wheel
  artifact qualification.
- `invokeai/app/services/model_install/install_staging_ledger.py:114` publishes
  a complete claim after flush/fsync through `publish_noreplace`; its install
  callers supply ownership/durable marker boundaries. Existing Studio producer
  directory-FD, create-only files and incomplete marker publication adapt that
  boundary rather than introducing another installer.
- `scripts/check_platform_locks.py:173,261`, `Lock.resolve` and `walk_closure`,
  with `.github/workflows/uv-lock-checks.yml:106`, supply exact lock resolution,
  marker filtering and separate package/extra visitation. `has_wheel` inspects
  locked filenames/tags, not ZIP contents. `scripts/build_wheel.sh`, called by
  `.github/workflows/build-wheel.yml`, builds a distribution but does not verify
  downloaded dependency wheel metadata.
- `pyproject.toml:373–390` supplies the global Notebook exclusion and records
  that different platform wheels of one version can declare different
  dependencies. A lock entry is therefore not the selected wheel's metadata.

No ready-made strict package-wheel ZIP/METADATA verifier was found in those
Invoke owners. Root disclosed that absence before extending the mechanism.
This adaptation combines Invoke streaming/hash/ownership principles with
Studio's existing worker-wheel inspector, planner and dependency-policy checker.
It does not add another dependency resolver, download queue or inference engine.
Apache-2.0 source attribution remains explicit; complete release license
acceptance is a separate gate.

## Material consumer and report boundary

`scripts/produce-runtime-wheelhouse.py` retains its existing plan-only mode.
With optional `--wheelhouse`, it still rereads the current lock, project and
built worker, verifies the locked development tooling and generates the exact
target plan. A previously saved JSON plan is not substituted for fresh source
inputs. Worker, lock and project identities are checked again before output
publication.

`scripts/runtime_wheelhouse_verify.py` consumes that generated plan and one
ordinary canonical directory whose membership must exactly match the selected
wheel filenames. Missing or extra files, partial downloads, links and changed
paths refuse. Each file's exact size and SHA-256 must match the plan before its
archive contents can supply a successful verdict. No wheel is extracted or
imported.

The verifier streams ZIP members to EOF to check CRC and lengths under finite
archive/member/expanded-byte limits. It refuses unsafe or duplicate member
names, file/ancestor aliases, links/special entries, encrypted or unsupported
compression and mismatched distribution metadata. Filename name/version/tags,
the matching `.dist-info/METADATA` and `WHEEL`, and required `RECORD` membership
remain separate checks. This does not qualify every behavior an installer or
native loader may later exercise.

Actual `Requires-Dist`, `Requires-Python`, markers and extras enter the existing
`imagegen_worker.runtime_dependencies` checker. Root `imagegen-worker[inference]`
and the fixed global Notebook exclusion remain unchanged; missing nonexcluded
dependencies and incompatible versions refuse. There is no metadata rewrite,
lock repair, undeclared package addition or diagnostic-text filter.

Prebuilt wheels may legitimately carry `Dynamic` headers. Outside an sdist,
these headers are informational: the selected wheel's actual dependency values
still enter the checker. Generic verification permits those declarations while
refusing identity fields declared dynamic; the worker-specific static-project
check remains unchanged. See the [PyPA Core Metadata specification](https://packaging.python.org/en/latest/specifications/core-metadata/#dynamic-multiple-use).

Wheel verification is cross-target Linux/x64 CPython3.12.13 with explicit glibc,
not the build host's marker environment. Marker facts unknown for that target,
including kernel release/version, must refuse when referenced before invoking
the existing checker. Host facts must not silently fill them. Target-compatible
wheel tags remain distinct from measured libc/driver/CUDA/native compatibility.

Successful publication retains the original `wheelhouse-plan.json` and
`requirements.txt` semantics. A separate `wheelhouse-verification.json` binds
its result to the canonical published plan's SHA-256 and records exact wheel
and metadata identities plus the dependency-policy receipt:

- `artifactBytesVerified: true`;
- `dependencyEvidence: "wheel-metadata"`;
- `installQualified: false`.

The original plan's unqualified flags are not retroactively changed. The
existing new-directory-only publication writes every requested output before
removing `.incomplete`. Failure retains incomplete output; a prior destination
is preserved. Verification does not sign or activate a runtime, and a verified
wheelhouse alone is not an installed release qualification.

## Finite bounds and verification axes

These are engineering refusal bounds, not measured release capacity. The final
owners and executed checks use the following limits.

| Parameter / owner | Intended bound | Refusal or observation |
| --- | --- | --- |
| One wheel archive / verifier |4GiB | reject before oversized archive work |
| Total selected wheel bytes / verifier |32GiB | exact finite accounting |
| Declared central directory / verifier |128MiB | preflight before stdlib ZIP allocation |
| Members per wheel / all wheels |100,000 /200,000 | finite ZIP traversal |
| Expanded bytes per wheel / all wheels |16GiB /32GiB | stop excessive expansion |
| One expanded member / verifier |8GiB | stream with bounded memory; reject excess |
| METADATA or WHEEL member / verifier |2MiB each | bound captured metadata |
| Total captured metadata / verifier |16MiB | match dependency-check input envelope |
| Serialized verification report / verifier and CLI |2MiB | includes plan binding and published pretty-format bytes |
| Existing dependency checker |10,000 distributions;100,000 declarations/visited edges;1,000 exemptions | inherited finite semantic check |
| Producer lock/project / existing owner |8MiB each | preserve prior input refusal |
| Qualification process envelope / Root |4GiB, zero swap,600s | actual owned cgroup, not release support capacity |

The central-directory preflight uses pinned CPython's stdlib ZIP end-record
helper. EOCD declarations alone cannot bound CPython's actual parsed index:
its parser walks central bytes and ignores the declared entry count. An
instance-local bounded `filelist.append` at `_RealGetContents` refuses while
the standard parser constructs the index, independently of a lying EOCD count.
At most one additional transient ZipInfo exists before that refusal; the
128MiB buffer limit remains separate. Both private APIs are tied to the pinned
CPython; no independent ZIP parser is introduced. Directory/file identity checks
do not claim general security against concurrent same-user interference.

The finite verification axes include exact file membership, hash/size, stable
input identity, filename/version/tag mismatches, duplicate/escaping ZIP paths,
CRC corruption, metadata drift, marker/extra/transitive dependencies, explicit
Notebook exemption and finite-limit refusals. At least one real CLI success
must enter the full consumer with downloaded locked wheel bytes. Negative
controls must refuse before successful publication. Semantic mutations must
reach the material consumer, produce the intended RED with a neighboring GREEN
and restore exact bytes. Authored tests, source review, actual byte/metadata
execution, installed inference and retained-byte audit remain distinct results.

## Results

Root executed **292 Python PASS**, zero failures/skips, across the verifier,
CLI, planner, worker-wheel inspector and dependency-policy tests. Strict typing
passes for the changed scripts/tests and the complete configured worker tree.
Configured worker Ruff and changed-script Ruff pass. No TS/Vue, worker-package
source, dependencies or lock changed; no new app build/browser/native run is
claimed. The retained dist snapshot is the unchanged base build.

The actual current-source worker wheel is **2,994,672 bytes**. All **73** worker
package files match tracked source. Root downloaded the other **66** exact URLs:
**3,154,463,513 bytes**, matching every locked size/SHA before publication.
The single resulting wheelhouse has **67 wheels /3,157,458,185 bytes**. Its
verification streams **5,770,045,138 expanded ZIP bytes** and captures
**690,598 metadata bytes**. The dependency receipt checks **120 requirements**
across67 distributions, with exactly one explicit exemption:
`compel` → `notebook>=6.5.7`.

Two full actual CLI invocations passed with byte-identical plan, requirements
and plan-bound verification outputs. Main's existing
`runtimeReleaseRequirements` returns identical requirement bytes for all67.
The explicit glibc2.28 fixture is not a qualified release support floor.
Actual source/input hashes before/after match; owned child exits are confirmed.
Only the final frozen r3 pair counts as the two canonical checks. Earlier r2
successes are retained before an equivalent private-access lint refinement.

Independent source review returned CLEAN after two concrete corrections. The
first real invocation refused Accelerate because a worker-only blanket
`Dynamic` ban had been applied to generic wheels; the PyPA-backed correction
preserves all actual dependency checks. Source review also found that EOCD
declared counts did not constrain stdlib index allocation. The bounded-container
fix and tiny lying-count/bound-neighbor controls now exercise the real parser.
The source reviewer did not execute tests or wheel verification.

A separate executor ran **18 selections =15 GREEN +3 intended semantic RED**
in one small isolated source copy. SHA bypass accepted a wrong locked digest;
dependency-check bypass accepted missing actual `Requires-Dist`; index-guard
bypass produced only a late post-index refusal instead of the required refusal
during append. Neighbor controls passed, both restored selections passed for
each mutation, and all eight copy/backup/current hashes match. No real SHARED
wheel was mutated and no OOM/setup failure is counted as semantic RED.

Raw attempts remain: first actual `Dynamic` refusal, initial typing diagnostics
and import/format/private-access lint issues, plus one mutation observer quoting
SyntaxError before collection. They are separate from the three semantic RED.
Exact commands/results live in `tests-frozen-r3.*`, `typing-final-r3.*`,
`typing-worker-r1.*`, `worker-ruff-r1.*`, `lint-fix-final-r4.*`,
`actual-wheels-frozen.json`, `download-summary.json`,
`worker-plan-source-proof.json`, `requirements-parity-final.json`,
`mutations.json`, `source-review.json` and `qualification-summary.json` in RUN.

No complete offline ML installation, Torch/CUDA/native execution, oldest-ABI/
driver/GPU matrix, full engine preview/download, publisher trust, public Setup,
distributable/update or MVP acceptance is established by adding this verifier.

## Artifact lifecycle and retained dependency

RUN:
`~/.codex/artifacts/imagegen-studio/runs/runtime-wheelhouse-verification/20261114`;
exact temporary root `~/.codex/artifacts/imagegen-studio/t-rwv-1114`.
The intended reusable wheelhouse is
`shared/runtime-wheelhouse-cp312-5526e7408e31-r1` under the same artifact root.
RUN and this new SHARED directory require reciprocal lifecycle dependencies.
It is distinct from the protected existing reusable worker/catalog/models.

Root's initial inventory records31,502,315,520 allocated root bytes and
64,580,857,856 available disk bytes, with GPU1,091MiB used/14,929MiB free.
No GPU work or runtime/model copy is required. About3.16GB of selected wheel
artifacts has a concrete purpose: one verified input set for the next full
offline assembly. Keeping that single set temporarily exceeds the30GiB root
soft budget; Root records the necessary exception, exact actual usage and
release condition rather than deleting protected data or duplicating the set.

The qualification downloader is a run-owned helper outside Git, adapting
Invoke streaming to temporary files with strict locked size/SHA-256 and
create-only publication. It is not a shipped network installer or a successful
package-compatibility test. Original source URLs/hashes, metadata, logs,
synthetic RED/GREEN fixtures and source/build evidence belong in compact
retention; the whole reusable wheelhouse must not be copied into every RUN
archive merely to record a dependency.

`protected-shared.json` records the canonical wheel identities, dependency and
134 raw METADATA/WHEEL snapshot hashes. The worker's redundant RUN build
hardlink was released only after canonical bytes and proof were preserved in
SHARED; the empty incoming directory was removed after transport exit. This
does not reclaim or remove the protected worker artifact.

`final-r1-source.*`, `final-r1-bundles.*`, `payload-inventory.json` and
`retained-payloads.tar.gz` identify compact retained bytes. The independent
`final-retained-audit.json` separately verifies archive/live/source evidence
and rehashes the protected wheelhouse; it is not independent inference
qualification. `cleanup-result.json`, `release-gates-post-cleanup.json` and
both lifecycle files record actual disposal/reclaimed space and the retained
reciprocal dependency. Raw RUN/TMP paths require reconstruction after disposal;
the pinned wheelhouse stays at its canonical path for the next assembly.

Keep the verified SHARED wheelhouse and its companion reports at their original
paths for the next concrete offline assembly/qualification consumer. Its
lifecycle must name that use and the condition for release after replacement
or completion of the dependent assembly chain. Root may dispose only its exact
idle temporary payload roots after retention, restoration, independent audit,
reader release and fresh physical/dependency checks. The retained wheelhouse,
existing SHARED runtime/models, managed Projects, ordinary app data, previous
archives and foreign processes remain outside that cleanup. Actual archive
inventories, reclaimed bytes and final reciprocal lifecycle state are Root's
completion records, not established by this authoring.
