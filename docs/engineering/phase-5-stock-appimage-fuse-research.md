# Stock AppImage FUSE launch and Saved generations

## Scope and source

Studio production base `d0104854623c3f5758301b9e4065af4a3b36552b`. The earlier
[standalone package check](./phase-5-linux-app-package-research.md) used
extract-and-run. The new local trial uses one stock AppImage on native KDE
Wayland. It repeats the workspace folder chooser through direct Type 2 FUSE
launch and runs Saved generations with both direct FUSE and extraction.
The current host has a working `/dev/fuse`, `libfuse.so.2` and
`fusermount3`. Clean-machine setup and the shipping host matrix remain open.

Consulted clean InvokeAI `4875d96531ca6712b288f6e660fcbb34143408c1` and clean
Invoke launcher `c267bdb439519216b277a7a8c6ad408b9d79efce`.
`docs/src/content/docs/start-here/installation.mdx` in InvokeAI delegates desktop
distribution to the launcher. Its `electron-builder.config.ts`,
`package.json` and the `build-linux` caller in `.github/workflows/build.yml`
remain the package basis. For history navigation, the current gallery uses
`ui/GalleryImageGrid.tsx`, `ui/useGalleryData.ts`,
`core/selection.ts::requestGalleryItemReveal` and
`data/backend.ts::getGalleryImageByName` under
`invokeai/frontend/webv2/src/features/gallery`. These owners use exact
item identity when revealing a result. The fixture tests Studio's existing
workspace, saved Project and accepted-layer owners.

## Native mount proof

Use the existing private KDE Wayland launcher, the fresh owned
`workspace-chooser` or `saved-results` fixture roots and the current AppImage.
For direct mode set `IMAGEGEN_LINUX_PACKAGE_FUSE=1` and supply
`asarSha256` alongside the normal package witness in `package-proof.json`.
The runner clears the extract-and-run override and inherited AppImage paths.
The evidence ties the launcher's argument or executable inode to the exact
owned Type 2 AppImage and follows Main to its read-only FUSE mount. It checks
the filesystem type, namespace, mount ID/device and mounted ASAR digest.
Ordinary close must confirm process exit and disappearance of the mount path
and identity before the next lifetime.
[Smoke runner](../../scripts/smoke-linux-package.mjs),
[FUSE observer](../../scripts/fixtures/packaged-appimage-fuse.mjs).

This host's enabled Type 2 `binfmt` rule invokes the AppImageLauncher
interpreter. The runner keeps the existing `APPIMAGELAUNCHER_DISABLE=1`
setting for desktop integration and validates the kernel interpreter, its
inode and exact package argument. Two preliminary attempts reached Home and
closed normally but were excluded because the first observer required the
wrapper's executable itself to be the package. The second collected the
native launcher and mount diagnostic. The final observer also confirms that
the loaded ASAR matches the exact package build. The system rule was
observed in place.
[Installed interpreter source](https://raw.githubusercontent.com/TheAssassin/AppImageLauncher/96cb937/src/binfmt-bypass/interpreter_main.cpp).

## Saved generations

The fixture copies two pinned synthetic `.igs` inputs from the
[earlier Smart variant qualification](./phase-4-smart-patch-history-research.md).
They share the document and layer IDs, with different saved revisions,
titles and local paths. The fixture changes the initial Raster seed to zero
in one owned copy using the current Project writer and pins that new
revision. This creates an explicit history field control. All original files
retain their exact bytes.

Each of the four Saved generations lifetimes verifies 34 rows through the
packaged API and renderer. Both target history PNGs decode and the ordinary Raster
shows seed zero. Clicking the other Project's inactive variant opens the
correct Project, selects its parent and focuses the exact variant with
`From history`. The parent stays locked and hidden, its active variant stays
the same, and the tab retains its saved revision and clean history. The
check matches both closed indexes per launch mode to the exact saved result
assets and verifies the `.igs` bytes after each close.
[Saved-result contract](../features/project/generate-mode/generation-results.md#app-level-saved-accepted-result-history),
[fixture](../../scripts/fixtures/packaged-saved-results.mjs).

## Executed result

AppImage SHA-256
`09c7c52920aa88f5e816e9b74ed19679f3b1f5f58124c8f3a91c6275d8188ff3`,
147,061,770 bytes. Every mounted ASAR matched the build digest
`86870c6ae2852688f51ad7711a7fc8ca0cbe701b0cd21a3e6bc7c84f9088085d`.

- `packaged-workspace-chooser/20261124-r7` passed Add Workspace and Locate
  Folder with direct FUSE. All three lifetimes closed normally. The five
  native portal outcomes and exact folder/Project bindings match the
  existing [workspace qualification](./phase-5-packaged-workspace-chooser-research.md).
- `packaged-saved-results/20261124-r1` passed both extract-and-run lifetimes.
  `packaged-saved-results/20261124-r2` passed both direct FUSE lifetimes.
  Each closed index retained 34 exact accepted results and two ready
  Projects. Both launch modes exercised the same two input identities and
  the same seed-zero control on independent AppData.
- The five FUSE mounts disappeared after their respective normal closes.
  Seven lifetimes emitted normal close receipts. The private run scopes
  each had a 4 GiB limit, zero swap and a 150-second wrapper deadline.

Independent readback rehashed the package, ASAR and 22 source pins, checked the
seven immutable SQLite bodies, and verified all saved package members in the
observed cases. It checked 65 exited process identities and independently saw a
live Saved generations FUSE mount disappear after close. The 42 focused Node
tests passed with zero failures and skips. AppImage packaging, scoped ESLint,
Prettier and syntax checks passed.

Cleanup reclaimed 564,113,408 allocated bytes from the exact private build,
failed fixture inputs and test profiles. Package proofs, native mount and
process receipts, portal traces, screenshots, closed indexes and synthetic
Project witnesses remain.
