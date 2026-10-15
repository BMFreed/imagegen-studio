# Smart Patch: owned coherence settings, controls and frozen capture

## Prospective document/UI/Main boundary

Base `05c067191b9d99e2907dc781a65c331cf7622e44` (qualified private CPU coherence).
This finite Phase4 slice follows PP-007/008,the layer-owned compositing requirement
in [Smart Patch](../features/project/generate-mode/smart-patch-layer.md) and
[compositing](../features/project/generate-mode/smart-patch-compositing.md),and
the existing [owned mask settings](./phase-4-smart-patch-mask-settings-research.md)
edit/Undo/Save/recovery owner. Risk is high:portable strict schema,legacy defaults,
captured editor ownership,history/shadow persistence and frozen worker policy.
The prospective plan below was written before implementation. Executed results
are recorded at the end; the earlier private CPU tests alone did not establish
working persisted controls or public inference.

The chosen slice promotes exactly three already-supported coherence parameters
to optional per-Patch document state and compact controls. It then binds the
private conditioning default to the resolved frozen owned profile. It does not
enable jobs,ML inference,candidates,variants,preset/comparison fields or accepted
provenance. The broader compositing MVP-candidate list is not otherwise promoted.

## Owned schema,defaults and accepted parameters

Add optional top-level Smart Patch `coherenceSettings`,separate from immutable
mask asset/descriptor and project-pixel `maskSettings:{blur,padding}`:

```ts
{
  mode: 'Gaussian Blur' | 'Box Blur' | 'Staged',
  edgeSize: number,       // integer0..1024 PROCESSING pixels
  minimumDenoise: number // finite0..1
}
```

Resolved defaults are Gaussian Blur/edge16/minimum0. Legacy absence remains
absent during parse/open/Save round-trip and resolves defaults only for consumers;
it does not dirty the document,create history,change member hashes or inject a
field. A default no-op edit likewise preserves absence. Explicit changed profiles
are stored by the normal Project owner. Malformed fields/extra keys/unknown mode,
fractional edge,out-of-range values,NaN and Infinity refuse rather than clamp or
silently substitute defaults. Raster cannot store this Smart Patch-only field.
The new reader accepts absent/explicit profiles;old strict readers accepting
new fields is not promised. No `.igs` version or new storage backend is introduced.

The units remain settled:**edge size is processing pixels**,**blur is world
project pixels**. Edge0..7 floors to latent radius0 in the existing helper;minimum
denoise is a coherence-floor parameter,not global Generation denoising strength.
Changing this profile never performs Fit,changes bbox/internal resolution or
rewrites authored mask PNG/bounds/id/revision. Padding remains Fit-only.

## Captured command and persistent lifecycle

Extend the existing targeted `updateSmartPatchLayer` API with one whole-profile
command:

```ts
{
  kind: 'coherence-settings',
  value: { mode, edgeSize, minimumDenoise },
  documentId,
  documentRevision
}
```

The existing tab/layer ID supplies the exact target. Main validates the strict
whole profile and captured document identity/revision before applying it. Stale,
locked,missing,foreign and Raster owners refuse. One genuinely changed profile
produces one normal document mutation/Undo step;no-op/default-from-absence creates
none. Deep-copy command values before async use;later caller mutation cannot
write a different profile into history or another layer. Mask/geometry/draft,
other Patch settings and normal Project draft remain unchanged.

Undo/Redo,explicit Save/loader and local autosave shadow/recovery use the existing
document/asset lifecycle. No new mask asset,preview renderer,worker persistence
or fake accepted result is created. Existing signed mask capabilities and prior
PNG retention remain owned by their current document/history owner. Save still
requires an explicit user action;unsaved local recovery does not rewrite `.igs`.

Accepted variants do not yet exist in production. Future variant staleness must
compare the frozen owned coherence profile as generation-relevant state;its
provenance belongs to `layerSourceContext`,excluded from reusable presets and
Compare generation settings. This slice does not fabricate those future fields
or mark nonexistent variants ready/outdated.

## Frozen capture bridge

The existing Main capture context adds resolved detached `coherenceSettings`.
It freezes this profile with the original document/layer/bbox/mask/source/blur
before awaits. Calling `prepareConditioning(worker)` uses that captured OWNED
profile,not a new global default or the current edited document. Explicit private
caller override remains available and must still be captured before its first
await. It is private test/operation policy,not a Project setting write.

The qualified processing algorithm,world keep-before-resize,soft numeric planes,
world-core restoration/WORLD blur and all six grouped output guards remain
unchanged. Caller-exposed context/bytes,override objects and adapter metadata cannot
poison a second operation. Each already-admitted preparation/conditioning chain
drains before capture cleanup even if callback closes or a sibling rejects;
post-closure capability reuse refuses. No queue or public Generate is enabled.

## UI and style contract

Use the approved selected-Patch Mask section and its existing compact rows:
`Coherence`, `Edge size`, `Minimum denoise`. Mode is a labeled public Naive
selector for the three exact supported modes;edge/minimum use compact raw numeric
inputs. Tooltips identify processing-pixel edge units and the difference between
coherence minimum and global denoising strength. Keep label/input association,
keyboard focus and explicit invalid states without adding another primary action.
No new palette/design direction approval is needed for this existing-interface
extension;approved layout,tokens/plain scoped CSS and Naive public APIs remain
authoritative. Read the component/API rather than assuming selector ARIA roles.

The owner retains detached raw drafts and captured document/layer identity through
editing. Numeric Enter/blur publishes at most one valid whole-profile edit;
invalid raw text stays visibly invalid and never gets silently rounded/clamped
into saved state. Escape or selection/document/navigation change cancels old-owner
drafts. Discrete mode selection commits an explicit profile intent. Locked/busy
editing disables controls. Independent updates must not accidentally overwrite
another field with stale local defaults;the whole-profile identity/revision fence
and acknowledged-owner refresh govern publication. Selection/focus transitions
must not produce duplicate edits or an extra Undo when the numeric field blurs.

These controls are editable document settings even without an ML runtime. Their
availability does not imply the selected model can generate a Smart Patch yet.
They do not replace Generation's denoising-strength control or become a preset
section. No hidden hover-only details or selection-driven card-height shift is
introduced.

## Parameter,path and consumer registry

| Parameter/consumer          | Bound/source                                              | Preserved/refusal behavior                                                                   |
| --------------------------- | --------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Coherence mode              | Exactly Gaussian Blur/Box Blur/Staged                     | Existing qualified CPU algorithms;strict new shared schema/captured Main change.             |
| Edge size                   | Integer0..1024,default16 PROCESSING pixels                | Existing private profile bound,not measured ML capacity;no conversion through world blur.    |
| Minimum denoise             | Finite0..1,default0                                       | Coherence minimum only;raw invalid input never publishes.                                    |
| Optional document profile   | Absent legacy or complete strict object                   | No partial/injected fields;read/default no-op preserves absence and clean state.             |
| Main command                | Captured documentId/documentRevision + tab/layer target   | Stale/foreign/locked/missing/Raster refuse;one changed profile one Undo.                     |
| Save/shadow/history         | Existing `.igs` writer/loader and local recovery owner    | Explicit Save only;mask assets/hashes/geometry and unrelated owners retained.                |
| Capture/context             | Detached resolved owned profile before await              | Default conditioning uses exact frozen owner;private override remains detached.              |
| CPU conditioning            | Existing /8 internal grid/2048side/4Mpixels/native guards | No new algorithm/capacity or dependency;old one-pixel prep stays valid.                      |
| UI section                  | Existing selected-Patch compact Mask controls             | Labels/keyboard/raw validation/disabled states;no new accent,primary action or panel layout. |
| Future provenance/staleness | Layer/source context,not reusable settings                | No new accepted variant schema,Compare/preset field or false readiness.                      |

## Verification plan

Use real shared schema/API validation,ProjectService/history/shadow,actual Save/
ZIP loader and built Electron UI,plus the existing production CPU conditioning
bridge. Test doubles may supply missing model/runtime catalog,not saved settings,
history results or self-declared coherence pixels.

- Strict schema/API cases cover absent legacy,explicit defaults,edge0/7/8/1024,
  minimum0/fraction/1,each mode and malformed/partial/extra/NaN/Infinity settings.
  Literal parse/round-trip comparisons prove legacy absence is not injected.
- Real Service creates independent Patch owners;targeted profile changes affect
  one layer only,one Undo/Redo and actual Save/read/reopen/local shadow. Default
  no-op preserves absence;stale/locked/foreign/missing/Raster requests refuse
  without document/history/seed/PNG/geometry effects. Observe autosave settlement
  before asserting stable shadow bytes.
- Actual built Electron keyboard/mouse selects modes,edits edge/minimum,retains
  invalid raw text,cancels Escape/navigation/owner changes and avoids duplicate
  blur/selection commits. Associated labels,field-to-field focus,locked/busy
  states,compact layout/scroll and standard/narrow screenshots are inspected
  under UI audit. Save/reopen and process death→Home Recover retain each owner.
- Main capture defaults use the old frozen OWNED profile after later settings
  edits/caller-context mutation. Real CPU conditioning produces distinct exact
  Gaussian/Box/Staged output for the appropriate literal fixture;explicit private
  override remains supported without changing the document. The previous CPU
  numerical oracle is preserved rather than replaced by a renderer mock.
- Execute isolated semantic faults for parser default injection,wrong target/
  whole-profile overwrite,default capture ignoring owned state or unit/bound
  mapping. Each meaningful RED has an unchanged neighboring control through the
  same production boundary;preserve exact restoration/physical exit.
- Root serializes required typecheck,lint/build,focused/affected tests and native
  runs under existing budgets. Prototype tests are required if prototype source
  is changed;prototype mock persistence is not production evidence.

Evidence follows [Artifact lifecycle](./artifact-lifecycle.md):inventory before
runs,reuse one compatible CPU/runtime environment,no model/environment copies
or downloads,compact native/pixel/probe evidence,physical exit/restoration before
cleanup and measured retained/reclaimed bytes. Documentation work itself adds no
runtime payload. Root remains sole heavy execution actor.

## Negative scope and later owners

No Smart Patch jobs/native inference,ML model/VAE/infill/denoising,public Generate,
queue/Retry,candidates/provenance,accepted variants/staleness/composition,
Regional Guidance,Patch presets or new Compare fields are added. Existing normal
OUT's fixed Gaussian algorithm and ordinary Project settings remain unchanged.
Latent coverage loss still requires a later explicit inference-admission policy.
Public PP-007/008 status remains «Пока не обещать».

## Failure signals and recovery boundary

Main refuses malformed/locked profile edits with `PROJECT_INVALID_INPUT` and
captured document/revision conflicts with `EDIT_CONFLICT` before mutation. The
existing Project error path reports the refusal; no setting, history entry or
saved member is replaced. The current loader rejects a malformed portable profile
as `INVALID_PROJECT`; it does not silently substitute defaults. Valid older
documents remain readable without injecting a member. An older strict app build
may reject newly saved fields; binary rollback alone is not a format downgrade.

Unsaved valid profile changes use the existing local shadow. Home Recover restores
that dirty document after a crash; the saved package remains the explicit-Save
baseline. Undo history is process-local and does not survive restart. Original mask
PNG bytes, descriptor/revision and unrelated document state remain owned by their
existing retention/persistence paths.

## Prototype and review limits

The prototype adapter edits the owned profile and mock history only. Its existing
accepted-variant provenance and staleness comparison omit `coherenceSettings`;
coherence edits do not yet mark prototype variants outdated. These controls do not
qualify acceptance or outdated derivation. Production accepted Patch variants,
their frozen provenance and staleness remain future work.

An informed independent source review found no concrete implementation defect in
legacy/no-op ownership, targeted Undo, alias isolation, persistence wiring or
frozen default capture. It executed no checks; it was not a blind/runtime audit.
Its two current prototype-coverage documentation contradictions were corrected.

## Executed evidence

Confirmed on base `05c0671` plus this working-tree slice,15.10.2026. Compact raw
evidence is retained under
`~/.codex/artifacts/imagegen-studio/runs/smart-patch-coherence-settings/20261015-owned-coherence/`.
Native reports retain exact source/bundle SHA before and after execution; the
final delivery manifest records the changed-source identities. No installed ML
runtime or model bytes were copied/downloaded for this slice.

| Boundary                             | Actual command/result                                                                                                                       | What it establishes                                                                                                                                                                                                                                                     |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Shared/schema,Service,CPU and editor | `pnpm exec tsx --test --test-reporter=tap --test-concurrency=1` with the four files in `focused-final-r2.json`:75 PASS,0fail/skip           | Strict profiles/API,legacy absence/no-op,two real Patch owners,one Undo/Redo,actual writer/loader/shadow,alias and revision guards,and actual CPU default/override/frozen-profile behavior.                                                                             |
| Remaining affected code              | Same serial runner over143 remaining Main/projects,shared/projects and renderer/components files,`affected-files.json`:1852 PASS,0fail/skip | Existing Project,queue,acceptance,worker-client and shared/editor neighbors. Combined with focused tests:1927 distinct TS tests across147 files.                                                                                                                        |
| Prototype                            | `pnpm run prototype:test --workers=1`:180 PASS,including five new shared-control browser cases                                              | Actual prototype interaction/labels/raw input/selection/navigation/lock/tooltips. Mock history is not production persistence. Full run preceded mechanical import/type-member-order/braces lint fixes;fresh final typecheck/focused/native checks followed those fixes. |
| Fresh desktop                        | `pnpm run app:build`; `pnpm exec tsx scripts/smoke-smart-patch-coherence.mjs --report-file <absolute-new-owned-report>`:14 scenarios PASS   | Actual Create/+Patch,mode and numeric editing,no-op/invalid/Escape,selection-before-blur,lock,one Undo/Redo,Save/ZIP/read/reopen and real process death→Home Recover→Save/reopen.                                                                                       |
| Required static/build checks         | `pnpm run typecheck`,`pnpm run lint`,`pnpm run app:build`:PASS                                                                              | Final application/prototype types,repository lint and fresh desktop bundle.                                                                                                                                                                                             |

The native report is `native-owned-final.json`;14 means named scenarios,not an
assertion count. Two Patch owners retain their independent settings,mask bytes,
geometry,draft and seed state. Dirty shadow/revision/hash is observed before
SIGKILL of the exact owned PID/start identity. Home Recover retains the dirty
profile,has no restored Undo history,and leaves saved package bytes unchanged
until explicit Save. The two compact saved `.igs` copies remain as raw evidence.
No model/runtime/queue output or fabricated profile response participates. One
real Main-painted mask is a declared input precondition;this smoke does not
requalify painting. The IPC observer invokes and returns the original handler's
actual response and is restored before shutdown/crash.

Visual audit used the existing `frontend-design-principles` app guidance and
`ui-audit` checklist. Viewed native screenshots cover1440×900,900×620,the mode
popup,bounded processing-unit tooltip,invalid raw edge,locked controls and Home
recovery. Three compact rows stay aligned and reachable;popup options and the
selected mode are readable,invalid text remains visible,and no primary action
was added. T3 preview was opened first;the resumed1280×800 prototype snapshot/
DOM inspection succeeded after the previous session's snapshot failures. Native
screenshots come from the repository's Electron harness and qualify the actual
desktop separately from that prototype.

### Executed semantic probes

`owned-coherence-mutation-probe.py --run` creates isolated same-directory TS
copies and rewrites their imports;it never edits production originals. Final
`owned-mutation-c89b9e5664-summary.json` confirms exactly1 causal RED+1 neighboring
GREEN per case,0skip,and physical exit before deleting every copy:

| Production fault                                                | RED                                                                                                                                                                                                           | Neighboring GREEN                                                                                   |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Omit coherence from Main's captured document/revision guard     | Existing refusal case fails with missing `EDIT_CONFLICT` rejection on its first foreign captured documentId. This is a shared identity/revision-gate probe,not an independently isolated revision-only claim. | Valid targeted whole-profile change still affects only B,one Undo and unchanged neighbors.          |
| Inject defaults in optional portable document schema            | Real parser adds `coherenceSettings` to a legacy document that had no member.                                                                                                                                 | Same real parser preserves explicit profiles and still rejects invalid/Raster ownership.            |
| Ignore owned capture profile and always default to Gaussian16/0 | Real Service-owned Box profile instead produces Gaussian conditioning.                                                                                                                                        | Explicit private Box input still yields its literal latent footprint through the same CPU boundary. |

All original source SHA match before/after. Mutation processes used2GiB/zero
swap/180s per case;none failed from import,timeout or OOM. The earlier numerical
Python268/36 pinned Invoke comparisons belong to the previous checkpoint,not a
new global Python run. No Python algorithm changed here;this slice reran actual
Main→CPU conditioning in the55-case preparation file and the surrounding TS
regression instead.

### Failed attempts and interruption accounting

Earlier setup/test failures are retained,not silently counted as successful runs:
two fixture expectations compared revision-bound signed Raster URLs or asserted
scratch removal before its lease closed;one typecheck required bracket notation
for dataset indexing. The first focused browser run assumed a tooltip ARIA role
not present in installed Naive;the test now inspects its actual visible popup and
the shared tooltips use public `maxWidth=280`. The first native baseline's3GiB
launcher violated the harness's2GiB-per-group guard before UI. Its independent
physical-exit proof is retained;cleanup stages were made independent before the
successful2GiB baseline/final runs. The old built baseline has no coherence
controls and qualifies only its actual Create/+Patch/Save observations.

The interrupted full prototype attempt ended after140 completed cases without a
full footer/report;`interruption-recovery.json` excludes it from the180-case
result and records no prior owned survivors. Initial repository lint found24
mechanical ordering/braces issues,then final lint passed. An initial mutation
harness mistakenly matched `# skipped 0` with a `# SKIP` substring check;its
incomplete summary remains retained. The corrected checker verifies TAP records
and the zero-skip footer,and the complete three-pair run above supersedes it.

### Resources,cleanup and remaining owners

Heavy runs were serial,zero-swap and deadline-bounded:tests/typecheck/build2GiB,
repository lint4GiB (observed peak3,902,750,720 bytes),one browser worker3GiB
(peak2,862,895,104 bytes). Native launcher and each verified native process group
use2GiB/300s. Actual native PID/start identities,owned scope exit,observer
restoration and bundle/source stability are in the retained reports. Temporary
mutation copies were deleted only after physical exit and unchanged-original SHA.

`cleanup-final.json` records independent process/environment/fd scans and deletion
of the three exact report-owned isolated XDG payloads:failed baseline
`coherence-baseline-payload-hzqByr`,successful baseline
`coherence-baseline-payload-aEaLYV`,and final
`coherence-native-payload-zvPxqe`. Actual allocated space reclaimed:
24,354,816 bytes (23.2MiB). Reports,logs,harnesses,source identities,screenshots and
two compact saved packages remain (~2.4MiB). Artifact root stays ~28GiB;protected
shared runtime/catalog (~27GiB),checkout Python environment and historically
pinned evidence are unchanged. Lifecycle is retained with no live payload
dependency;the historical1GiB evidence-budget exception remains explicit.

The next finite owner is private model-source/infill preparation,then inference
admission/execution and immutable variant acceptance. Latent-coverage admission
policy still needs its later explicit decision. This slice enables neither jobs
nor Smart Patch Generate,accepted variants,staleness/provenance,presets/Compare
fields or release readiness;PP-007/008 body and matrix keep their public status.
