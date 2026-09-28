# Phase 2A Linux/NVIDIA runtime packaging spike

Checked on 2026-09-25 against the dirty ImageGen Studio working tree and the
clean local Invoke launcher checkout at
`/home/user/Work/sources/launcher/`, `main` commit
`c267bdb439519216b277a7a8c6ad408b9d79efce`. This is a packaging
assessment, not an installed runtime or a successful Linux/NVIDIA activation.
The governing contracts are
[Python runtime management](../specs/07-python-runtime-management.md#release-artifacts)
and [Phase 2A](../specs/01-implementation-roadmap.md#фаза-2a-runtime-project-document-и-реальное-сохранение).

## Evidence from the current checkout

| Boundary                  | Checked evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Consequence                                                                                                                                                                                                          |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Worker graph              | `worker-python/pyproject.toml:5-18` pins Python `>=3.12,<3.13` and Pillow `12.2.0`; `.python-version` is `3.12.13`. `worker-python/uv.lock:1-3,26-49,85-102` includes an editable worker and dev tools. Searches found no `torch`, `diffusers`, or `transformers` package entries.                                                                                                                                                                                                                         | This lock cannot yield the required Linux/NVIDIA inference artifact. The current worker declares `derivatives-only` and explicitly excludes CUDA/inference (`worker-python/README.md:1-3,16`).                       |
| Existing app boundary     | `src/main/runtime/index.ts:52-95,111-135` reports absent/unverified runtime and leaves install/repair unavailable. The pointer reader validates an absolute Python path under app data (`:205-304`).                                                                                                                                                                                                                                                                                                       | There is no production installer or verified runtime to qualify yet.                                                                                                                                                 |
| Local development venv    | `worker-python/.venv/bin/python` is an absolute symlink to `/home/user/.local/share/uv/python/cpython-3.12.13-linux-x86_64-gnu/bin/python3.12`; `pyvenv.cfg` records that absolute `home`; `bin/imagegen-worker` starts with an absolute shebang under this checkout.                                                                                                                                                                                                                                    | Copying this venv as-is would depend on this machine's paths. It was not built as a release bundle, so this observation does not disprove a purpose-built relocatable bundle.                                        |
| Invoke launcher reference | The clean checkout uses a pinned `uv` download/checksum (`download_uv.ts:92-124`, `package.json:127-139`), advisory GPU detection (`src/main/gpu-detection.ts:9-24,310-334`), and a managed Python via `uv python install ... --python-preference only-managed` (`src/main/install-manager.ts:547-565`). It passes `uv venv --relocatable` (`:619-641`) but installs at one path rather than proving a later move. Repair deletes the current `.venv` (`:594-605`) and sync uses `--inexact` (`:743-763`). | Reuse download/progress/probe ideas only. Its destructive repair and inexact sync violate our previous-known-good and exact-install contracts. A flag alone does not qualify Torch/CUDA native files for relocation. |
| Ambient sources           | The launcher documents that `--no-config` does not remove `UV_INDEX`, `UV_EXTRA_INDEX_URL`, or `UV_FIND_LINKS` from the process environment (`src/main/torch-index.ts:60-79`).                                                                                                                                                                                                                                                                                                                             | Our installer must construct a restricted environment as well as passing offline/no-index flags.                                                                                                                     |

The local checkout and environment were checked with these read-only commands
from the ImageGen Studio root (plus targeted `rg` and `nl -ba` reads of the
paths cited above):

```bash
git -C /home/user/Work/sources/launcher status --short --branch
git -C /home/user/Work/sources/launcher log -1 --format='%H %cs %s'
uv --version
uv venv --help
uv sync --help
uv pip install --help
readlink -f worker-python/.venv/bin/python
sed -n '1,50p' worker-python/.venv/pyvenv.cfg
head -1 worker-python/.venv/bin/imagegen-worker
```

The local `uv` reports `0.11.11`; the launcher release configuration pins a
different `uv` (`0.11.28`). Local help output is not a test of that bundled
binary or of a wheelhouse installation. No artifacts were downloaded,
environments relocated, or GPU tests run.

## Delivery choice

| Option                                                   | Benefit                                                                                                                                             | Qualification risk                                                                                                                                                                                                                                                                                                   |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Relocatable Python + fully installed package bundle      | CI does the installation; client verifies and extracts one assembled runtime.                                                                       | Every Python path, console script, symlink, native extension, shared-library reference, and Torch/CUDA loader path must survive relocation from the CI prefix to multiple app-data prefixes. Neither the local dev venv nor the Invoke launcher's `--relocatable` flag proves this for the complete inference graph. |
| Verified app-managed CPython + signed offline wheelhouse | CI selects every Linux x64/CUDA wheel; the client assembles an exact environment at its final absolute path, without needing to relocate that venv. | More client disk, install time, and installer work. CI must publish an exact platform-specific wheel set and worker wheel, and main must enforce offline, no-build, exact package membership and post-install checks.                                                                                                |

**Recommended starting route:** app-managed CPython plus an offline wheelhouse.
The contract already permits it (`07-python-runtime-management.md:172-190`),
and the current evidence does not qualify a relocatable inference bundle. A
future bundle can replace it only after the relocation gate below passes on
the actual pinned Linux/NVIDIA graph. This is an engineering delivery choice
within the accepted contract; no new product decision is needed for the
mechanism itself.

The offline path must avoid a hidden relocation. Allocate a unique immutable
`runtime/environments/{runtime-id}/` at its **final** absolute path, with an
incomplete marker and no active pointer. Install verified CPython under the
app-owned `runtime/python/` tree; create the venv in that final environment
path, install the exact CI-selected wheels from local verified files, and
self-test there. Remove the marker only after successful validation, then
atomically replace `current-runtime.json` to publish the new environment. On
failure, leave the pointer and previous runtime untouched and clean only the
unpublished directory. Do not build a normal venv in `{runtime-id}.staging`
and rename it later: that changes its absolute path and reintroduces the
relocatability requirement. The runtime ID must distinguish separate installs
of the same worker version so Repair never reuses the active path. A proven
relocatable bundle may use a separate extraction directory before final
placement.

The client should invoke a pinned `uv` and CPython by absolute paths in a
restricted environment. The release wheel list must be selected in CI from
`uv.lock`, include a built non-editable `imagegen-worker` wheel, and omit dev
groups. Client installation must use only verified local wheels with network
and indexes disabled, reject `sdist`/build fallback and undeclared packages,
and compare the installed distribution/version set to the manifest. Do not
assume `uv sync --locked` alone makes the current lock offline: it includes
registry source URLs and an editable project. The exact `uv` command and
requirements format must be proven with the selected release binary in an
offline installer test; `uv` help alone is not such proof.

## Required release manifest identity

The signed manifest should bind all bytes that the client may execute to one
release and one profile. Minimum fields:

1. Manifest schema version, release/channel ID, signing key ID and signature
   over a canonical manifest representation; trusted public key is shipped
   with the Electron app. Include app-version compatibility, worker version,
   worker protocol version, runtime profile (`linux-nvidia`), and required
   capabilities. The existing `derivatives-only` handshake must never pass
   this profile gate (`worker-python/src/imagegen_worker/protocol.py:46-54`).
2. Target OS/architecture and ABI floor (Linux x86-64, glibc/manylinux and
   CPython wheel tag); selected CUDA/PyTorch build, minimum compatible NVIDIA
   driver and supported GPU architecture range. These values come from the
   qualified artifact, not from an advisory hardware probe.
3. Exact CPython build/version, source identity, download URI, artifact format,
   byte length, SHA-256 and entry executable; exact `uv` version/artifact
   identity if it is used on the client. Include the release `uv.lock` digest
   and built worker wheel digest so a selected wheelhouse cannot silently
   drift from the lock.
4. For every selected wheel: distribution name, exact version, wheel filename
   and compatibility tags, download URI/source identity, byte length and
   SHA-256. Include the expected exact installed distribution set and total
   download/unpacked size for preflight and integrity checks. No alternative
   index or source distribution may fill a missing member.

Manifest verification must precede execution or extraction of untrusted
content; each artifact size/hash must be checked before use. Download cache is
separate from the active environment. Safe extraction rejects path traversal,
symlinks escaping the app-owned tree, duplicate paths and unreasonable
expanded sizes. The installed runtime's own identity/protocol/capabilities
are checked again before activation, not inferred from archive filenames.

## Qualification gates and current blockers

1. **Build the missing inference graph.** Pin the Invoke-like pipeline,
   PyTorch/CUDA, Diffusers, Transformers and native extension versions in a
   production Linux/NVIDIA lock; build the worker wheel and CI-selected
   wheelhouse. At the time of this spike the lock had only Pillow and the
   `derivatives-only` worker; the later [inference extra and runtime qualification](./phase-2b-internal-handoff-and-conditioning.md)
   still do not provide an app-owned release artifact. The original state was
   insufficient for the Phase 2A gate (`07-python-runtime-management.md:216-239`,
   `worker-python/README.md:1-3`).
2. **Prove package and host compatibility.** On the oldest intended Linux ABI
   and a representative supported NVIDIA matrix, with no system Python and no
   package-network access, install from the signed artifacts. Check imports,
   native/shared library loading, dependency consistency, actual CUDA tensor
   execution, worker subprocess handshake and self-test. Check the selected
   CPython artifact's stdlib, `sys.prefix`, TLS/OpenSSL and native extension
   loading from its app-owned destination. A PCI or `nvidia-smi` signal is
   advisory, not proof that this Torch build runs on the GPU. Test
   missing/stale driver and unsupported GPU diagnostics without damaging the
   previous runtime.
3. **If considering a bundle, test relocation rather than assume it.** Build
   under one prefix; extract under at least two unrelated absolute prefixes
   and run the same checks with the build prefix absent. Inspect symlinks,
   `pyvenv.cfg`, script shebangs, `.pth` files, native library load paths and
   absolute build-prefix references. Repeat with the full CUDA/native graph,
   not just the current Pillow-only worker. Any failed relocation keeps the
   wheelhouse route.
4. **Prove failure isolation.** Inject interrupted download, bad signature or
   hash, unsafe archive, full disk, installation failure, failed self-test,
   crash before pointer publication, and failed post-activation startup.
   Reopen the previous known-good worker after each failure; ensure cache or
   incomplete-directory cleanup cannot remove models or `.igs` projects.
   Reserve space for verified downloads, an unpublished environment and the
   previous runtime before starting (`07-python-runtime-management.md:49-69,179-188,241-254`).
5. **Exercise release inference.** Run real Illustrious and Anima jobs with
   LoRA, promised modes and regional inputs; basic imports or a tensor test do
   not establish the image pipeline or Anima negative spatial semantics
   (`07-python-runtime-management.md:230-239`). Keep model weights and Anima
   Qwen3/VAE assets in the separate model-library lifecycle.

The runtime manager still returns `RUNTIME_INSTALL_UNAVAILABLE`; no signed
release manifest, production Linux/NVIDIA wheel graph, installer, relocation
experiment, or supported driver/GPU/ABI floor is evidenced in this checkout.
Those are implementation and qualification blockers, not a reason to claim
PP-007 complete. Engineering may choose the artifact mechanism. Before a
public Linux/NVIDIA support claim, product and engineering must agree on the
actual supported distribution/ABI, driver, and GPU-generation floor if it is
narrower than the broad target in the current roadmap.
