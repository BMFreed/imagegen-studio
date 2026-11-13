# Full-resolution Project image export

Base: clean master `0dea34e4068f03e6ae07d0252f96e15fbc668e4e`.
High risk: native destination IPC/filesystem publication and immutable Project
snapshot. Supporting contracts: [canvas export](../features/project/generate-mode/image-and-bounding-box.md#export-and-crop-boundary),
[sRGB/storage](../specs/03-data-storage.md), PP-001/007 and explicit-intent PP-008.
No generation, acceptance, implicit Save, crop, source-asset rewrite or custom
export rectangle is introduced. No family/model/runtime readiness promotion.

## Fresh Invoke source and adaptation

Clean Invoke `4875d96531ca6712b288f6e660fcbb34143408c1` reread before implementation:
`invokeai/frontend/webv2/src/workbench/canvas-operations/exportCanvasComposite.ts`
and caller `saveCanvasToGallery.ts`, widgets `useCanvasGallerySave.ts`;
`canvas-engine/exportRasterComposite.ts`, `render/rasterComposite.ts` and its
engine caller, `render/raster.ts` PNG encoding. Maintained paths replace the old
saveCanvasHooks/copyHooks names in historical notes. Export chooses content bounds
versus explicit current bbox, snapshots the immutable document, composites into a
transparent finite surface, encodes PNG and refuses stale/not-ready/over-budget.
Reservation and pin leases release in finally; there is no document Save.

The user was informed before adaptation: Invoke's destination is gallery upload/
browser download, not Electron durable create-only native publication. Reuse the
existing Studio candidate image writer/native dialog boundary. Its snapshot
checks adapt to Studio coordinator identity, documentId/revision, monotonic epoch
(to catch Undo ABA), path and relocation. The existing writer beforePublish guard
is the final current-owner check after temporary bytes are synced.

Invoke content bounds use transformed source rectangles, not nonzero alpha, and
its enabled predicate differs from Studio visibility/opacity/Smart semantics.
Studio already owns actual alpha bounds through CPU preview composition and
`projectActiveRasterContributions`; reuse these rather than copying a divergent
classifier/compositor. Canonical pinned sRGB PNG uses Studio's existing owner;
browser PNG encoding does not explicitly inject the Studio profile. No project,
generation prompts, copied provenance or regional conditioning are exported as
image metadata. Checkerboard, selection, masks/regions and temporary candidates
are excluded from raster content.

## Finite consumer and parameter registry

Renderer File menu → strict typed preload/Main region request → existing CPU
worker lease (independent of CUDA readiness) → captured Project stack/assets via
`withFrozenRasterComposition` → existing CPU compositor full-resolution export
mode → exact verified canonical RGBA sRGB PNG → native destination choice →
current-owner recheck → existing create-only synced file publication → feedback.

The only regions are `canvas` and `bbox`. Canvas uses actual visible Raster and
active visible accepted Smart contributions in their existing stack positions,
transforms, opacity and blend. Empty/hidden/inactive variants do not enlarge
bounds. Bbox always means the captured primary bbox, regardless of selected Smart
Patch. All-transparent Project refuses image export; a bbox outside otherwise
visible content may export an exact transparent rectangle. PNG alpha is retained.
No preview-sized image is passed off as a full-resolution export.

The parameter limits are existing Studio image/composition safety ceilings,
not measured release capacity or Invoke's 512MiB WebGL reservation:

| Parameter | Existing source / intended reuse | Refusal |
| --- | --- | --- |
| export side / area | image16384 /64,000,000pixels | reject before output allocation, no downsample |
| source total decoded area | existing compositor128,000,000pixels | explicit over-budget |
| contributing layers | existing compositor256 | explicit refusal |
| encoded export PNG | existing merged256MiB | bounded publication/readback |
| inference target | unchanged2048side/4,000,000pixels/32MiB | existing refusal unchanged |
| world bounds | existing preview coordinate/extent guards | existing refusal |
| protocol line | existing64KiB JSON-line ceiling | explicit refusal; layer ceiling is not guaranteed capacity |
| runtime/worker | existing Project CPU resolver, new explicit export capability | no silent legacy fallback |

The bounds are code-level ceilings; native tiny fixtures do not establish maximum
capacity. Worker protocol1 and retained generation defaults stay unchanged;
legacy workers lacking the export capability cannot be treated as supporting it.
Unpackaged native qualification may explicitly opt into the existing development
CPU worker; it does not establish installed release-worker delivery.

## Risks and verification plan

Freeze document and pending asset buffers before filesystem awaits; saved assets
are extracted under the existing package path lock with exact hashes. Unknown
regions, corrupt input/output, wrong PNG dimensions/profile, oversized world union,
worker failure and missing runtime refuse without publishing or changing Project.
Pending renderer draft edits flush through their existing owner before capture.
Stale document/epoch/owner/path after composition or destination choice refuses;
no silently updated content is exported under an earlier reviewed snapshot.

Cancel publishes nothing. Existing destination (including a racing file) is
preserved and requires another filename; `.igs` and non-PNG suffixes refuse.
Same-directory temporary creation/sync + create-only link commit reuse the current
writer. Failed temporary work is cleaned; a committed destination is not undone
because a later directory sync warning occurred. Export does not mutate saved
package, Project dirty/history/provenance, queue, recovery or source assets.

Planned evidence: actual Python/Pillow full-resolution pixels/bounds/blends/alpha,
strict client/protocol validation and unchanged target neighbors; actual service
entry and files with Cancel/stale/ABA/close/existing-destination controls; built
Electron File menu and real CPU output for both regions, normal physical close
and restart. Semantic mutation must reach actual consumer and fail for the intended
invariant with adjacent GREEN and exact restoration. Source review, Root execution,
visual self-review and independent retained-byte audit remain distinct.

Run: `~/.codex/artifacts/imagegen-studio/runs/project-image-export/20261113`.
Fresh root29GiB/shared17GiB/runs13GiB, disk62GiB free; GPU8404MiB used/7616MiB free.
No GPU, ML/runtime copies, SHARED access or foreign-process stop is needed.
Check groups4GiB/zero swap/600s; native launcher/groups2GiB and480s deadline.
Retain source/bundles/raw attempts/own payloads before reader release, fresh
physical-exit/dependency closure and exact no-follow cleanup. Previous raw payloads
were removed after retention; do not resume them.

## Results

ROOT final `unit-r2`:81 Node PASS across8 explicit files, including actual
ProjectService with the real CPU transport through native destination choice.
`python-r2`:127 Python PASS across6 explicit files, including real Pillow outputs,
JSON-line worker, preview/target/protocol/derivative/Smart output neighbors.
`typecheck-r3`, `build-r1`, full4-part `lint-full-r1`, final scoped test/harness lint,
full Python typing/Ruff and format check pass with recorded baseline exceptions.
All selected final tests have zero failures/skips. Earlier runs are not added to
final counts. Full format found one unchanged `test_illustrious_dpm_sampling.py`;
its base bytes are verified before explicit exclusion. The sole ESLint parser
exclusion `qualify-installed-regional-init.mts` likewise matches retained/base bytes.
The initial Ruff invocation from repository root selected the excluded vendor and
wrong import roots; the corrected configured worker cwd check passed. No unrelated
Python/vendor source was rewritten. Initial typecheck found ROOT's type import
outside the SFC script; it was fixed and independently reread.

A mutation executor subagent ran three isolated semantic mutations. Removing the
monotonic epoch guard allowed actual stale ABA publication; dropping primary-bbox
selection published a wrong rectangle; introducing a preview-like scale cap made
the real Pillow consumer publish2048×1 from2051×1. Each has a neighboring GREEN,
actual semantic RED and exact restored GREEN, with copied module import witness
and retained wrong-PNG witness for Python. A first scale0.5 attempt refused before
PNG because the thin source vanished; it is retained/excluded from the post-PNG
RED claim. Mutation execution is subagent evidence; ROOT inspected raw outcomes,
separate from independent source review and ROOT native execution.

ROOT final built Electron `native-r9`:12 checks, two normal physical lifetimes,
three screenshots,28 source hashes (including actual Python CPU owners) and five
bundles. Real File actions export exact2075×36 content and64×64 primary bbox while
Smart authoring bbox differs. Larger inactive variant, hidden/zero-opacity Raster,
empty Smart, overlays and temporary candidates do not contribute. Actual Cancel,
existing destination and unsupported-region refusals, empty-message UI, no implicit
Save/dirty/history/provenance/queue/package/asset change and exact restarted whole
PNG match pass. Native Save choice is controlled/restored; it is not OS picker
usability qualification.14 observed CPU workers physically exit through the
existing owner's SIGTERM close: zero healthy-code0 exits are claimed for them.
Both Electron lifetimes close normally; no harness kill/SIGKILL or GPU is used.
Original IPC/dialog/spawn handlers are restored with zero in-flight calls.
ROOT opened all three final screenshots under `ui-audit`; no material local
layout/action finding at1440×900/900×620, bounded self-review only.

Raw attempts remain distinct. r1 failed on an invalid Naive menu-role selector
before a CPU request; its cleanup incorrectly required a CPU child and left the
owned Home window open. ROOT restored/asserted observers over the owned inspector
and requested normal window close; waiting for exit while inspector stayed attached
caused a separate recovery timeout. Disconnect then allowed exit. Fresh PID/start/
cgroup checks prove complete physical exit; the compact recovery companion records
this, without rewriting r1's raw failed status or calling it a normal qualified
lifetime. No product work/CPU child occurred. r2/r3 failed because the harness used
the wrong ElectronApplication.evaluate argument signature and tried cloning the
Electron module as the selected destination; actual CPU export already completed.
r4's independent oracle incorrectly assumed identity transforms preserve source
RGB exactly. Public Pillow identity BICUBIC and the unchanged generation-target
control independently confirm existing premultiplied-alpha rounding (e.g.25→23
at alpha64). The oracle was corrected; no production rasterizer/default changed,
and exact source-RGB identity is not claimed. r5–r8 exposed harness assumptions
about Home replacement, duplicate Open Home buttons and Close's pending catalog
refresh. The final harness awaits the actual catalog completion before Home
activation. These are retained harness/control failures, not semantic mutations
or independent successful native cohorts.

Independent production source review is CLEAN source-only (27 Studio hashes and
fresh Invoke basis). Final retained-byte/document/harness audit is separate.
This uses the explicit unpackaged source-CPU development adapter, not an installed
release worker update. No inference, Generate/Add, maximum64M capacity, arbitrary
user projects, overwrite/custom rectangle, ML/runtime copy, SHARED/foreign process
change, release delivery or full MVP acceptance is established. Public statuses
remain **«Пока не обещать»**.

## Retention and delivery

Run retains selected checks, raw failed attempts and matching harness snapshots,
recovery limits, exact mutation restoration/diffs/PNG witness, independent alpha
control, source and actual bundles plus every owned payload entry/SQLite companion.
Retention/archive/live byte continuity and independent READ_FINISHED/readersClosed
must precede a new exact PID/start/group check and no-follow cleanup. Only exact
RUN payloads/native-project-export roots and `t-pie-1113` may be removed. The mutation
copy's node_modules symlink is retained as a link, never followed into dependencies.
No SHARED dependency exists. Final manifests, actual reclaimed allocated bytes,
commit/tree/live remote continuity and lifecycle state are in RUN
`qualification-summary.json`, `final-retained-audit.json`, `release-gates.json`,
`commit-proof.json` and `artifact-lifecycle.json`. Removed raw paths cannot be resumed.
