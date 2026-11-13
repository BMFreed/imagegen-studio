# Build-time Linux/NVIDIA wheelhouse plan

Base: clean master `4e1854c85b3dcedf87d67be13d892a219da7cdca`.
High risk: release dependency completeness, executable artifact identity and
create-only producer publication. Supporting contracts:
[runtime management](../specs/07-python-runtime-management.md#release-artifacts),
[packaging route](./phase-2a-runtime-packaging-spike.md), PP-001/004/007/008.
Public promise statuses remain unchanged.

This finite checkpoint produces a build-time **plan**, not a downloaded or
install-qualified wheelhouse. It connects the committed lock and project metadata
to one target-compatible wheel identity per runtime distribution, replacing the
editable root with a verified built worker wheel. No publisher key, signed full
release, transport, CPython/config/uv payload, LaMa delivery or public Setup is
introduced. Wheel-only totals are not the complete engine download preview.

## Fresh Invoke source and adaptation

InvokeAI `4875d96531ca6712b288f6e660fcbb34143408c1` was reread with callers:

- `scripts/check_platform_locks.py`: `Lock.resolve`, `walk_closure`, `env_for`,
  `has_wheel` and `check_closure`. Exact dependency identities, active markers,
  base/selected-extra edges and separate package/extra visitation supply the
  reusable closure mechanism. Unresolved edges must not silently shrink it.
- `.github/workflows/uv-lock-checks.yml`: the platform-check caller runs the
  checker after locked resolution with a bounded packaging dependency.
- `tests/test_check_platform_locks.py`: transitive/unresolved edges and a package
  reached plainly before its requested extra exercise the source semantics.
- `pyproject.toml`: deliberate Notebook exclusion; adjacent dependency metadata
  override explains that Linux/Windows wheels of one version can have different
  requirements. The selected wheel's actual metadata therefore matters.

Invoke's checker tests wheel availability, not exact producer selection. The
user was informed before extending it: complete ABI/glibc tag ranking,
hash/size/URL checks, built-worker byte/metadata inspection and producer
publication are absent there. Adapt the closure and use standard `packaging`
parsers/tags rather than inventing a marker, version or wheel-name parser.
Duplicate identities, ambiguous references and unknown requested extras become
explicit refusals. Unsupported conflicting-extra universes refuse; the current
Studio lock does not need their special internal uv tokens.

Studio's existing `offline-runtime-assembly.ts` `workerWheelFiles` and its
`assembleOfflineRuntime` caller supply ZIP/member validation and finite bounds.
The new worker inspector adds project-to-wheel metadata binding without
extracting or executing that wheel. The producer's output publication adapts the
existing runtime controller's directory-FD/identity and create-only pattern.
No new installer, process executor, sampler, queue or inference engine is added.
Invoke is Apache-2.0, with NOTICE copyright2022–2026 InvokeAI Contributors;
source attribution is retained. This is not complete release license acceptance.

## Material consumer and target

`scripts/produce-runtime-wheelhouse.py` reads stable, ordinary lock/project files
and the supplied built worker wheel. The locked development `packaging` version
must match the lock; current tooling is26.3, already present through the existing
development dependency graph. No dependency/environment change is required.

`runtime_worker_wheel.py` verifies the worker archive's stable bytes, filename,
pure-wheel tags, project name/version/Python and base/inference declarations.
It refuses duplicate or escaping members, links, unsupported metadata and
editable payloads. Its five-field descriptor binds the local worker hash/size.
This verifies that archive, not a publisher signature or installed behavior.

`runtime_wheelhouse_plan.py` adapts the Invoke closure for root
`imagegen-worker`, base plus only `inference`, excluding development groups.
The exact target is Linux/x86_64, CPython3.12.13/cp312, with an explicit glibc
argument. Referenced marker facts that are unknown for that target refuse;
`packaging` must not fill them from the build host. Versions and local suffixes
remain exact. Current PyPI Torch2.7.1 has no added CUDA suffix; its CUDA dependency
closure is not replaced with an independently chosen index build.

Standard CPython/compatible tags use explicit descending manylinux targets and
legacy aliases, plus abi3 and pure-any compatibility. `sys_tags()` is not used.
The `linux_x86_64` tag has no measured glibc floor; accepting it as a candidate
does not qualify the declared release ABI. The best matching tag selects one
artifact; equally preferred alternatives refuse. Registry wheels require exact
HTTPS URL, filename/version, locked SHA-256 and positive size. There is no sdist
build fallback. The local editable root is replaced only by the inspected wheel.

CLI publication requires a new output directory. Directory FDs anchor writes;
an `.incomplete` marker remains on failure. After synced successful publication,
`wheelhouse-plan.json` and `requirements.txt` contain the deterministic result.
Existing directories/files are preserved. The plan carries lock/project hashes,
target, selected extras and explicit exclusions; requirements are intended to
match Main's `runtimeReleaseRequirements` byte-for-byte.

Output is explicitly `artifactBytesVerified: false`,
`dependencyEvidence: lock-graph-only`, `installQualified: false`. Only the built
worker archive's bytes were inspected. Selected external wheel bytes/metadata,
full offline assembly and actual Torch/CUDA execution remain separate gates.

## Confirmed dependency-check gap

Studio's pyproject and `uv.lock` both exclude `notebook`, following Invoke's
explicit policy for Compel. The ordinary `uv pip check` in the current offline
assembler does not yet carry that policy. ROOT's read-only uv0.11.11 probe of the
existing development environment checked73 packages and reported exactly one
incompatibility: Compel2.4.0 requires `notebook>=6.5.7`, which is absent.
This is Root's actual read-only execution, separate from the document author's
source research and from the new producer tests.

That result is a real installer-check gap, not a semantic mutation or a failure
of wheel tag selection. The producer records the exclusion and remains
unqualified for installation. It does not add Notebook outside the lock, rewrite
third-party wheel metadata or suppress the check. A later exact dependency-check
consumer must intentionally adapt the Invoke policy with its own evidence.
Lock closure alone also cannot establish the dependency closure of the selected
third-party wheel metadata, including platform-specific requirements.

## Finite bounds and verification

| Parameter | Current owner / bound | Meaning on excess |
| --- | --- | --- |
| Lock/project input | CLI/planner8MiB each | reject before planning/publication |
| Lock packages / visited edges | planner10,000 /100,000 | finite closure refusal |
| Target glibc | explicit2.17–2.99; compatibility tags down to2.5 | engineering range, not a qualified support floor |
| Selected wheel sizes / total | positive exact integers /2^53−1 total | refuse unsafe accounting |
| Worker archive / expanded payload |64MiB /64MiB | bounded archive refusal |
| Worker member / metadata / count |16MiB /2MiB /5,000 | reject oversized or malformed wheel |
| Root check groups |4GiB, zero swap,600s | validation envelope, not release capacity |

Executed cases cover marker facts, dev exclusion, transitive and later-extra
visitation, missing/ambiguous identities, unknown extras, source/version drift,
ABI/glibc/architecture selection, malformed URLs/hashes/sizes, sdist-only refusal,
worker ZIP/metadata corruption and existing/partial output preservation.
Real current-lock/worker CLI, deterministic repetition and Main requirements
parity enter the actual producer. Lower glibc and corrupt worker controls
refuse without publishing an output. Semantic mutations reach the consumers,
yield the intended RED, retain neighboring GREEN and restore exact bytes.
Authored tests, source review, Root execution and retention audit are distinct.

## Results

Root executed **130 PASS**, no failures/skips, across the three new Python test
files. New scripts/tests pass strict basedpyright, configured worker typing
passes, and Ruff checks pass both for the six new files and the configured
worker tree. Explicit worker-config formatting checks pass. Only basedpyright
`extraPaths` changed in pyproject; package/build/dependency/uv policy and uv.lock
are unchanged. No TS/Vue or prototype UI changed; no new browser/app/native
inference qualification is claimed.

The actual uv/Hatchling build produced the noneditable
`imagegen_worker-0.1.0-py3-none-any.whl`: **2,989,916 bytes**, SHA-256
`832ec936882a1876a2c52f2753a3406b176a489f86fb190dcca8faef726f66b6`.
A separate Root source proof matched all **72** worker package payload files
to tracked current source and verified unchanged package/build declarations.
Archive inspection alone does not provide that Git/source proof.

Five actual CLI checks passed: current lock plus built worker, byte-identical
repeat, glibc2.17 refusal, existing-output preservation and truncated-worker
refusal with original inputs unchanged. The explicit glibc2.28 fixture produced
**67 wheels**, **3,157,453,429 bytes** total, **3,154,463,513** external bytes.
The fixture is not a product ABI-floor decision. Real Main
`runtimeReleaseRequirements` produced byte-identical requirements for all67.
The plan records the Notebook exclusion and all qualification flags remain false.

Independent source review found one P2 publication race: replacing the newly
created directory with an existing nonempty directory between mkdir/open let
the producer add outputs there. Root reproduced that regression, added a
directory-FD emptiness check before the first write, and obtained the passing
control plus a narrow independent CLEAN re-review. This closes the observed
nonempty substitution; it does not prove creator identity against arbitrary
same-user interference or an empty-directory swap.

Two actual semantic mutations ran in an isolated eight-file copy:
**12 selections =10 GREEN +2 intended semantic RED**. Removing transitive
traversal lost addon/leaf while its neighbor passed. Bypassing worker metadata
equality let an actual modified ZIP with wrong Torch Requires-Dist pass the
consumer; its canonical neighbor stayed GREEN. Both exact restorations passed;
all eight copy/backup/current-source hashes match. Six owned units physically
exited. Source reviewers did not run those checks; retained-byte audit is a
separate verification level.

Raw failed attempts are retained: two initial fixture failures came from a TOML
encoder putting top-level keys inside the last package; that encoder was fixed.
Initial strict typing/import-order issues were corrected. A full Ruff invocation
from the wrong working directory included existing vendor files; the proper
configured worker invocation passes. A later format check omitted the explicit
worker config and was repeated with that config, without changing source.
These setup/check errors and the existing Notebook pip-check result are not
counted as mutation RED. The publication regression is recorded separately.

Exact commands, logs, input/source hashes and physical-resource reports live in
`tests-final-r3.*`, `typing-final-r3.*`, `typing-full-r1.*`, `lint-final-r3.*`,
`ruff-worker-r2.*`, `format-check-final-r5.*`, `actual-plan-final.json`,
`requirements-parity-final.json`, `worker-source-proof.json`, `mutations.json`
and `source-review.json` under the RUN below. No full wheelhouse download,
selected third-party wheel METADATA closure, offline ML installation, oldest-ABI/
GPU matrix, publisher trust, public Setup or MVP acceptance is established here.

## Artifact lifecycle

Run: `~/.codex/artifacts/imagegen-studio/runs/runtime-wheelhouse-plan/20261114`.
Initial Root inventory: root30GiB(shared17/runs13), disk60GiB free,
GPU1735MiB used/14285MiB free; no GPU work. Small own build cache, worker wheel,
plan outputs and synthetic fixtures have a concrete producer-check purpose.
Protected SHARED, previous retained archives and ordinary app data are untouched.

Source, built wheel, exact plans/requirements, raw attempts, diagnostics and
mutation controls are retained with hash inventories. Archives are not an
automatic relocatable runtime: reconstruct only exact needed files into a new
owned run, recheck hashes/tooling/target and create fresh output directories.
No old raw `--resume`. No selected external wheel bytes or ML models were copied.
`final-r1-source.*`, `payload-inventory.json`, `retained-payloads.tar.gz` and
`final-retained-audit.json` identify the retained set. Existing dist bundles are
retained as unchanged base artifacts, not a new app build.

Only this RUN's `payloads` and exact `t-rwp-1114` temporary root are disposal
candidates after independent audit, reader release, exact restoration and fresh
physical/dependency checks. `cleanup-result.json`, `release-gates-post-cleanup.json`
and `artifact-lifecycle.json` record actual disposal/reclaimed bytes and final
state; the source note does not replace those receipts. Protected SHARED,
models, managed Projects and their companions remain outside this cleanup.
