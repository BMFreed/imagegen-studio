# Phase 1 Model Manager — implementation evidence

Review scope: Phase 1 of [the implementation roadmap](../specs/01-implementation-roadmap.md#фаза-1-model-manager), PP-004 and its [managed-library contract](../contracts/managed-model-library.md). This is local evidence for the Phase 1 implementation built on `eff4354`; the production user flow is not yet the whole PP-004 promise.

## Boundary and invariants

The renderer calls typed preload IPC; Electron main owns the token, CivitAI requests, installation queue, files and SQLite. An import preview retains the exact CivitAI model/version/file IDs. Main downloads a selected file into app-owned staging, validates available size and SHA-256, then publishes a content-addressed file and its catalog/job records. A different CivitAI version keeps a separate version ID even when its verified bytes are shared. Changing default affects new selections only; repairing an exact version preserves its resource, version, file and default IDs.

Anima Base 1.0 resolves only from the pinned checkpoint hash. Its Qwen3 encoder and VAE must both be verified before the checkpoint is published. The install preview states the total required bytes and the separate non-commercial, non-production license restriction; the weights are not bundled. Cancellation or failed verification leaves no new selectable checkpoint. A failed or interrupted job becomes terminal, staging files are removed, and startup removes unreferenced managed files. Known missing/corrupt exact files can be re-downloaded; a source file whose hash changed is refused as a repair. Token plaintext and source download URLs are never written to SQLite or `.igs`.

## Failure and recovery signals

The install queue exposes `waiting`, `downloading`, `verifying`, `completed`, `failed` and `canceled` with an error code/message for failures. A cancel request is shown as requested until the terminal event arrives. On restart, unfinished jobs are failed rather than resumed; a verified catalog entry remains available. If a managed file disappears, the catalog reports a missing version and the exact CivitAI file can be repaired. A same-size file whose content changes is reported as corrupt rather than ready, and cannot be selected as default until repaired. These are local recovery paths, not a guarantee that CivitAI will continue serving the source file.

The download limits are implementation safety ceilings, not measured product capacities: 32 GiB for an unknown-size file, five redirects, 20-second response-header timeout, 60-second idle timeout and 24-hour total timeout. CivitAI metadata requests use 15 seconds; a source preview image is capped at 1 MB. The Anima pinned artifact group totals 5,628,159,670 bytes. Free disk space, network throughput, VRAM and source availability are external conditions; the full download and worker load have not been measured on the release artifact.

## Verification and remaining boundaries

- `pnpm run app:test`: 70 passed, 0 failed, 0 skipped. Integration cases cross real SQLite and local files for install/reopen, distinct versions with shared bytes, default, exact repair, missing and same-size corruption, cancellation, restart cleanup and Anima group failure. Network and secure-storage providers are replaced with controlled test doubles.
- The exact-version repair test detected an isolated semantic mutation that published a new identity; after restoring the implementation, that test and the adjacent shared-file control passed. The catalog integrity regression first failed when a same-size changed file was still reported ready, then passed after the status check hashed the file.
- `pnpm run prototype:test`: 141 passed, 0 failed, 0 skipped. The version flow and existing exact references are mock UI behavior; they do not prove Project persistence.
- `pnpm run typecheck`, `pnpm run lint`, `pnpm run prototype:build`, `pnpm run app:smoke` and `git diff --check` passed locally. The Electron smoke opens Model Manager and exercises the empty catalog and storage IPC from a fresh app profile.

No live CivitAI download, real secure Linux keyring, complete 5.6 GB Anima install, packaged Python worker or generation load has been checked. Project model/LoRA selectors, Preset handoff, accepted-result provenance and resource removal with reference diagnostics belong to later production slices. PP-004 therefore retains `Пока не обещать` in [the promise matrix](../product-promises.md#матрица-обещаний).

Catalog status caches a hash verdict for an unchanged filesystem fingerprint and deduplicates concurrent checks, but a cold catalog still hashes the full Anima artifact group. Its latency has not been measured on the release package and should be measured before calling a large installed library responsive.
