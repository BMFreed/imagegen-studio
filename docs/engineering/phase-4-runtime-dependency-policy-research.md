# Signed offline runtime dependency policy

Base: clean master `a858e82788700e3ef245775800dc6fb7149a005b`.
High risk: an installer dependency verdict can allow an incomplete environment
to reach qualification, or reject the deliberately trimmed Invoke-derived
runtime. Supporting contracts: [runtime delivery](../specs/07-python-runtime-management.md#release-artifacts),
[offline assembly](./phase-4-runtime-offline-install-research.md),
[wheelhouse plan](./phase-4-runtime-wheelhouse-plan-research.md), PP-001/004/007/008.
Public promise statuses remain unchanged.

This finite change adds an explicit signed dependency-check policy to the
existing assembler. It does not download or qualify a complete wheelhouse,
deliver a publisher trust root, install a full ML runtime, change inference
defaults or expose public Setup.

## Trigger and fresh Invoke source

The previous checkpoint recorded a real mismatch: Studio follows Invoke's
global Notebook exclusion, while ordinary `uv pip check` sees Compel's declared
`notebook>=6.5.7` and refuses. That old probe checked73 installed development
packages and found one incompatibility. It is historical Root execution, not
this document author's independent run or a new semantic mutation.

The current InvokeAI source was reread at
`4875d96531ca6712b288f6e660fcbb34143408c1`, with callers:

- `pyproject.toml:373–383` declares global `exclude-dependencies = ["notebook"]`.
  Its comment explains that Compel does not use Jupyter/IPython and that the
  global form preserves uv-version compatibility.
- `uv.lock:31` retains that exclusion in `manifest.excludes`.
- `.github/workflows/python-tests.yml:212,357` installs through
  `uv sync --locked`; `docs/src/content/docs/development/Setup/dev-environment.mdx:50–63`
  instructs developers to use sync and shows `--frozen`.
- `scripts/check_platform_locks.py:173,261` supplies exact resolution, active
  marker filtering, base/transitive traversal and separate package/extra
  visitation. A package reached plainly before a later requested extra must
  still visit that extra's dependencies. Missing edges cannot silently shrink
  the closure.
- `.github/workflows/uv-lock-checks.yml:106` calls that checker; its corresponding
  `tests/test_check_platform_locks.py` covers transitive, later-extra and
  unresolved-edge cases.

No exclusion-aware installed `Requires-Dist` checker was found in Invoke's
scripts, app or install workflows. Root disclosed that missing mechanism to the
user before extending it. The implementation adapts Invoke's policy and
traversal to installed Core Metadata, using standard `packaging` requirement,
marker, version and specifier parsers. It is not a claim that Invoke supplied an
unchanged ready-made installed checker. Invoke's Apache-2.0 source attribution
is retained; complete release license acceptance remains separate.

Invoke's adjacent `pyproject.toml:385` metadata override also records wheels of
one package version with different platform requirements. Lock metadata alone
cannot prove the selected third-party wheel's actual dependency declarations.

## Owners and signed contract

`runtime-release.ts` admits only the optional signed manifest field
`dependencyPolicy: "invoke-inference-v1"`. An absent field preserves ordinary
strict `uv pip check` and the existing base CPU assembly path. Explicit null,
unknown policy values and arbitrary exclusion/extra overrides refuse. The plan
producer names this policy so a future release producer can bind the intended
consumer; the plan remains unqualified for installation.

The policy fixes root `imagegen-worker`, root extra `inference` and global
excluded dependency `notebook`. Signing covers the policy choice together with
the exact worker/wheel identities. This is an additive field in schema1:
the new reader accepts old manifests without it, while an older exact-key
reader rejects a manifest containing the new field. That behavior does not
establish the final release/protocol compatibility matrix.

`assembleOfflineRuntime` keeps the existing runner, timeout, cancellation,
fresh-slot claims and incomplete markers. For the opted-in policy it first
checks installed distribution membership against the signed manifest and
matches installed worker payload bytes to the verified release wheel. Only
then does the installed interpreter execute
`-I -B -m imagegen_worker.runtime_dependencies` through the existing command
owner. The checker imports metadata/parsing libraries, not Torch or another ML
runtime. Ordinary absent-policy assembly retains the strict uv check.

The worker checker reads bounded ordinary installed `.dist-info/METADATA`
files. Standard metadata declarations determine requirements, markers,
versions, Python compatibility and requested extras; dependencies are not
inferred from an import or a lock entry. Every installed distribution's base
requirements are checked, with root `inference` and recursively requested
extras visited independently. `Requires-Python` is optional Core Metadata;
any present declaration must be valid and satisfied.

The environment supplies the complete standard `packaging` marker facts of
the executing installed interpreter; this is not cross-target wheel selection.
Base edges use `extra=""`; an extra's marker context belongs to that declaring
package. Version matching retains the pinned `packaging` semantics: since26.0,
a single prerelease satisfying the specifier can match with the default policy;
an out-of-range version still refuses.

Missing nonexcluded packages, incompatible versions/Python, malformed metadata,
duplicate normalized package identities, unknown requested extras and active
nonexcluded direct-URL requirements refuse. Inactive marker edges do not demand packages.
Only an active Notebook edge is exempted, and each exact edge is recorded in a
deterministic receipt. Notebook appearing as an installed distribution refuses;
this is a fixed global exclusion, not permission to ignore other errors.

Main validates the checker response's exact policy/shape, root/extra/exclusion,
Python identity, package count and finite counters/exemption records. Success
is retained in installation provenance for the opted-in policy. A zero exit
code with an invalid response is not accepted. Failure, cancellation or
unconfirmed exit leaves the new slot incomplete and the previous runtime
unchanged; no successful installation receipt or activation may follow.

## Refusals, alternatives and blast radius

Adding Notebook would broaden the accepted dependency set outside the current
lock. Rewriting third-party wheel metadata would sever the artifact identity.
Filtering `uv pip check` text would couple correctness to diagnostics and risk
hiding another mismatch. The explicit policy checks metadata and records its
one inherited exclusion instead. It neither changes a failed check to success
nor relaxes exact signed distribution membership or worker byte verification.

The changed path is Main's internal offline assembly through the installed
worker checker. UI, queue, model storage, project persistence, generation,
samplers and public Setup do not gain behavior from this checkpoint. A signed
policy is not proof of source quality: package artifact verification, installed
qualification, host checks and activation/recovery remain their own gates.

## Finite parameters and verification plan

These are engineering refusal bounds, not measured maximum release capacity.
The final owners and actual checks use these bounds.

| Parameter / owner | Intended bound | Evidence / refusal |
| --- | --- | --- |
| Installed metadata per distribution / checker |2MiB | refuse before unbounded metadata parsing |
| Total installed metadata / checker |16MiB | refuse excess aggregate input |
| Installed distributions / checker |10,000 | reject excess or duplicate identities |
| Declared requirements / checker |100,000 | finite metadata declaration refusal |
| Visited requirement edges / checker |100,000 | finite traversal refusal |
| Requirement text / checker |4,096 characters | reject oversized declaration |
| Notebook exemption records / checker |1,000 | reject excessive receipt |
| Serialized checker response / checker |1MiB | refuse before oversized stdout |
| Command stdout / existing Main runner |2MiB | fail and confirm owned scope exit |
| Command log / existing Main runner |8MiB | fail; retain incomplete slot |
| Command deadline / terminate / exit confirmation |300s /5s /10s | timeout is not physical-exit proof |
| Root validation envelope |4GiB, zero swap,600s | test boundary, not release capacity |

Collector support is intentionally filesystem `.dist-info` metadata in the
pinned CPython path, using its `PathDistribution._path` implementation detail.
Accepted Core Metadata versions are the explicit known set1.0,1.1,1.2 and
2.1–2.5. Name/Version each require one declaration; duplicate optional
Requires-Python also refuses. Legacy/zip metadata and unsupported layouts refuse instead
of falling back to an unbounded read. Bounded no-follow descriptor reads and
stable identity checks do not claim security against arbitrary same-user
interference. Final collector API/limits and concrete refusals require actual
execution evidence below.

The finite test axes are policy absent/valid/invalid signed input, report
validation, exact distribution membership/worker-before-check ordering,
nonexcluded missing/version/Python errors, marker activation, direct URLs,
transitive/later-extra traversal, duplicates, bounds and cancellation/failure
retention. Actual installed metadata must enter the new checker. A semantic
mutation must reach that consumer, give the intended RED alongside its GREEN
control and restore exact bytes. Source review, controlled transport tests,
actual metadata execution, complete offline assembly and retention audit are
different evidence levels.

## Results

Root executed **148 Main PASS**, zero failures and one existing opt-in actual
host-preflight case skipped because `IGS_RUNTIME_HOST_ACTUAL` was not requested.
These three test files exercise real signatures, inventory, filesystem and
assembler/report consumers with controlled command transport; they do not
install a full runtime. **122 Python PASS** cover the new checker and changed
wheelhouse planner. The previous stage's130 tests are not added to these counts.

`pnpm run typecheck`, `pnpm run app:build`, strict Python typing and configured
worker Ruff checks passed. Full ESLint passed with only the two explicit,
unchanged parser exclusions `scripts/qualify-installed-regional-init.mts` and
`scripts/qualify-regional-character-visual.mts`, whose current hashes match base.
No prototype UI changed, and no new browser/native inference run is claimed.

The actual isolated production module checked the existing development
environment's **73 installed distribution metadata files**. Its deterministic
receipt contains exactly one exemption: `compel`, `notebook>=6.5.7`. Six checks
passed: isolated module invocation, exact captured-metadata replay, ordinary
dist-info collector replay, and refusals for a wrong real Pillow pin, absent
Torch and an added nonexcluded transitive dependency. Captured input bytes were
changed for those controls; the installed environment was unchanged. The same
environment's ordinary uv0.11.11 pip-check still reported exactly the one missing
Notebook dependency. That expected comparison is not semantic mutation RED.
The development environment is editable; this is actual installed-metadata
evidence, not a signed noneditable offline-release qualification.

An independent source-only review returned CLEAN. A separate executor ran two
implementation mutations in one isolated source copy: **81 selections =79 GREEN
+2 intended semantic RED**. Broadening the exclusion to other missing packages
caused `DID NOT RAISE`; bypassing both Main policy identity comparisons caused
the actual report consumer to accept a wrong policy. Neighbor controls passed;
both exact restorations passed. Eight critical copy/backup/current hashes match.
The Python import refresh preserves its AST; Main's added braces preserve
behavior. Historical execution hashes remain retained; these separate refresh
records do not relabel reruns.

Raw failed attempts are retained separately. Two initial authored test failures
were invalid direct-URL marker spacing and an outdated pre26 prerelease
expectation; fixtures/assertions were corrected to the standard parser behavior,
not by weakening production checks. Initial strict typing errors were fixed.
ESLint found three missing test braces, then passed. An initial root-cwd Ruff
fix misclassified the worker package import; the proper configured worker check
restored the original separating blank line and passes. Mutation setup's pnpm
copied-checkout status refusal occurred before tests; actual Main phases used
the existing absolute Node/tsx and that refusal is not mutation RED.

Exact commands, logs and physical exit/resource records are in RUN's
`tests-final-r3.*`, `python-final-r3.*`, `typecheck-final-r3.*`, `build-r1.*`,
`python-typing-r2.*`, `worker-ruff-final-r2.*`, `lint-full-r2.*`,
`actual-installed-metadata-final.json`, `legacy-pip-check-r1.*`, `mutations.json`,
`source-review.json` and `qualification-summary.json`. The canonical actual
metadata report is the r2 report: its frozen source/helper/test hashes match
the final tree. The r3 repeat is retained as a superseded cosmetic-test snapshot,
not six additional acceptance checks.

No selected third-party wheel download/METADATA archive closure, complete
offline ML installation, supported glibc/driver/GPU matrix, publisher trust,
full engine preview/download, public Setup, upgrade/update or MVP acceptance is
established by adding this consumer.

## Artifact lifecycle

RUN:
`~/.codex/artifacts/imagegen-studio/runs/runtime-dependency-policy/20261114`;
exact temporary root `~/.codex/artifacts/imagegen-studio/t-rdp-1114`.
Root owns inventory, runtime reuse choices and bounded execution. No model or
ML runtime copy is required merely to read installed metadata. The existing
development environment is a separate read-only fixture, not a new disposable
runtime or proof of signed noneditable installation.

Initial inventory: root31,456,952,320 allocated bytes,64,647,688,192 available
disk bytes, GPU1,029MiB used/14,990MiB free; no GPU work. The17 exact public config
files needed by signed-inventory tests were reconstructed from their verified
retained archive, not an old raw path. No previous runtime or model was copied.
The mutation copy holds only source with an explicit external node_modules
link; retention stores the link without following it.

`final-r2-source.*`, `final-r2-bundles.*`, `retained-payloads.tar.gz` and
`payload-inventory.json` retain source, the newly built app, exact metadata
inputs, config and mutation controls. `final-retained-audit.json` records the
separate independent byte/document audit. Source review, Root execution and
retained-byte audit are different results.

Only this RUN's `payloads` and exact `t-rdp-1114` are owned disposal candidates
after reader release, restoration and fresh physical/dependency checks.
`cleanup-result.json`, `release-gates-post-cleanup.json` and
`artifact-lifecycle.json` record actual disposal, reclaimed bytes and final state.
Reconstruct needed inputs into a new owned run from verified members; do not
use old raw paths or assume the archived source copy is a relocatable runtime.
SHARED, models, managed Projects, ordinary app data, foreign processes and
previous retained archives remain outside this cleanup.
