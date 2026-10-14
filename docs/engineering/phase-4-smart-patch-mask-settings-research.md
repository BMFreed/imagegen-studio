# Smart Patch mask blur and bbox padding

## Prospective boundary

Base `d5984a3`, clean `master`. User approved two compact rows after Hide overlay /
Clear mask in the existing Mask section: Mask blur16px and BBox padding8px.
High risk: portable document schema, Main edits/history, legacy defaults and
Save/recovery. PP-007/008, [Smart Patch](../features/project/generate-mode/smart-patch-layer.md)
and [Transform/Fit checkpoint](./phase-4-smart-patch-mask-transform-research.md)
remain the surrounding contracts. No Smart Patch inference or accepted variants
are implemented in this slice; next inpaint owner must consume the same blur.

## Decisions and consumers

- Layer-owned optional `maskSettings: { blur, padding }`, separate from immutable
  mask pixels/revision. New patches store16/8. Older documents omit the field and
  resolve16/8 without injecting fields during parse/open or making them dirty.
  Existing strict package/member/hash/shadow validation remains authoritative.
  New reader reads both forms; forward compatibility with older strict readers
  is not claimed. Raster schema and generation presets remain unchanged.
- Blur and padding are nonnegative integer project pixels, each0..512. Blur
  ceiling follows Invoke's numeric input; padding ceiling is an explicit finite
  engineering decision, not a measured inference capacity. Sum0..1024; grid8 and
  coordinate/bbox ceilings remain. Fit uses current owned settings, rounds
  outward and changes only bbox when invoked. Changing settings does not fit
  automatically, bake blur into mask PNG, or advance mask revision.
- Extend existing targeted `updateSmartPatchLayer` with captured
  `mask-blur`/`bbox-padding` changes (`value`, `documentId`, `documentRevision`).
  Independent scalar updates avoid overwriting the neighboring parameter.
  Main rejects malformed/stale/locked/missing/Raster owners and no-op values
  leave history/revision unchanged. Settings use existing document/history and
  retained asset owners, with no new IPC channel or worker.
- UI keeps detached local raw string drafts with the original owner/revision through
  focus. Enter or blur commits once; invalid input never publishes and Escape or
  owner/document changes cancel. Labels have associated input IDs, compact width
  shared with Brush size, and explicit tooltips distinguishing edge processing
  from Fit margin. Empty masks can configure future processing; locked/busy
  controls disable. Original painted PNG is retained.
- Future inpaint/compositing snapshot must freeze owned blur and use it for edge
  processing; bbox padding is fitting policy. Changing blur will stale existing
  future variants. This is a recorded future integration requirement, not a fake
  worker implementation or a currently blurred preview.

## Verification plan

Real schema/API/Service tests cover absent legacy fields, explicit0/default/max,
invalid/extra keys, exact owner isolation, no-op/stale/lock, one Undo/Redo and
actual Save/read/reopen/local shadow. Fit has literal asymmetric negative-origin
expectations with unequal blur/padding and0 controls; a settings or margin
semantic mutation must fail its real Service expectation with a nearby GREEN.
Actual built Electron edits fields through UI, switches owners while editing,
uses Fit, Undo/Redo, Save/reopen and actual crash/recovery. Existing native mask
harness is extended rather than copied. Source/bundle guards, physical exit,
small payloads, serial zero-swap deadlines and verified-idle cleanup apply.
Typecheck/lint/build and impacted tests qualify source; viewed screenshots at
1440×900 and900×620 qualify placement under ui-audit. Prototype remains mock
history, with no claim that it proves production persistence.

## Executed evidence

Evidence root: `~/.codex/artifacts/imagegen-studio/runs/smart-patch-mask-settings/20261014-settings`.
This is informed implementation self-review, not a blind audit. Source/bundle
identities and actual outcomes are retained in `native-r8/report.json`.

### Actual boundary and checks

Raw `NInput` → captured scalar → existing preload/IPC → real ProjectService →
document/history/shadow → actual Save/ZIP manifest/loader → reopened UI. Fit
uses current owned settings after the existing mask asset/revision fence.
Fixture creation/import corruption are prepared test data; the native observer
forwards unchanged commands/replies to the original Main handlers and restores
them. Model catalog/runtime are absent, previews use the workerless fallback.

- `projects-regression.log`: **1835 PASS**, no skip, serial affected Main Projects,
  shared Projects and renderer tests before final UI refinement. Main/shared
  business source stayed unchanged afterward.
- `focused-final.log`: **104 PASS**, no skip, after final helper/focus changes:
  shared mask/schema, actual Main mask/Smart Patch integration and renderer mask
  editor/gesture/Transform/Fit continuation helpers.
- `typecheck-final.log`, `lint-final.log`, `build-r7.log`: **PASS**. Prototype
  source is unchanged; prototype typecheck is part of the required typecheck.
  Prototype mocks/screenshot tests do not qualify production persistence.
- `native-r8/report.json`: **109 PASS**, ten screenshots, guarded source/bundles
  and two confirmed physical exits including actual crash. A16/8 and B31/5
  survive UI Save/clean reopen. Unsaved A9/11 plus B31/5 survive process death →
  Home Recover → explicit Save/raw package/reopen; old saved bytes remain exact.
  Both PNGs and normal/Raster inputs are compared at real boundaries, including
  rejected corrupted Import. No ML inference or accepted variant is claimed.
- Native mouse/Space/Enter Fit, zero settings, raw513/-1/1.5/blank refusal,
  one scalar Undo/Redo, Escape/owner/document navigation cancellation, field
  focus, stale/foreign/locked API refusals pass. Literal Fit expectations around
  B116,-28,60,180 are31+5 →80,-64,136,256; zero →112,-32,64,184;
  focused padding6 →72,-72,144,264.
- Actual screenshots at1440×900 and900×620 were viewed under ui-audit. Labels,
  compact92px visible surfaces and right edges align with Brush size. Input hit
  centers, associated labels and viewport clipping are measured; resize leaves
  document/history unchanged. This is local evidence, not a full WCAG audit.

One explicit Fit click may first commit a valid focused scalar. A captured
continuation waits for successful new document revision, expected both settings,
same owner/mask descriptor/bounds and original bbox/internal size, then sends
Fit once with the new revision. Failure/context change consumes the intent;
settings alone never create Fit. Enter and field-to-field focus are preserved.
Document navigation cancels the old owner's draft before blur can start a write.

Three qualified isolated semantic RED/neighbor GREEN pairs are aggregated in
`mutation-summary.json`; originals are byte-exact and all copies removed:

| Mutation                       | Observable RED                                           | Unaffected neighboring GREEN                                  |
| ------------------------------ | -------------------------------------------------------- | ------------------------------------------------------------- |
| Fit ignores owned settings     | Real Service unequal/zero Fit literal bbox fails         | Same Service default24 Fit, original PNG/Undo/Save passes     |
| Scalar writes every Patch      | Real B-only settings/pixels/history/Save invariant fails | Same targeted Service bbox/internal-resolution remains B-only |
| Parser injects absent defaults | Actual legacy parser absence assertion fails             | Same parser new infinite-coordinate document stays valid      |

Two initially selected owner controls also exercised the mutated scalar path;
these are retained as excluded control selection, not qualified pairs. The
replacement uses the same Service geometry path. The tests use actual parsers,
Service, writer/loader, filesystem and shadow owners, not a self-declared model.

### Corrections and excluded attempts

- First focused run47/48 failed because a new assertion required `kind=raster`
  on a DTO with a valid absent legacy tag. Replaced it with real pre/post Raster
  metadata comparison excluding only its signed URL; later1835/104 pass.
- Native-r1/r2 reached the first numeric edit without a Main command. R2 showed
  DOM16 versus local raw31, unchanged owner/revision and disabled=false; Enter
  reread16 and produced no-op. This was our custom controlled `NInputNumber`
  format/model integration, not a general library bug. Detached raw `NInput`
  now publishes only strictly validated values and never silently clamps513.
- Native-r3 failed on repeated evidence PNG filename (`EEXIST`); unique per-call
  labels fix the harness without weakening assertions.
- Native-r4 confirmed focused padding6 committed once but Fit emitted0 commands
  and bbox stayed80,-64,136,256. Blur began the scalar action and disabled Fit
  before click. Captured continuation and scoped pointer-focus preservation fix
  it; r8 verifies one scalar plus one Fit with the literal new bbox.
- Native-r5 passed that interaction, keyboard/invalid Fit and refusals, then its
  layout oracle compared inner text fields of different Naive controls. Viewed
  outer boxes already aligned. Corrected oracle measures visible surfaces while
  retaining native input hit/clipping checks and recording measurements first.
- Native-r6/r7 are excluded compositor/deadline attempts (32/33 baseline checks,
  no settings/Home qualification). About six minutes elapsed with only21s CPU.
  Read-only CDP found visible/focused renderer, normal100ms timer, one RAF in1200ms
  despite background throttling=false. Separate read-only DRM evidence found
  connected DP-1 enabled=disabled/DPMS=Off. This supports a hardware frame cadence
  hypothesis, not a product-state failure. R8 disables frame-rate/vsync limits
  **only in this test launcher**, observes12 RAF samples within350ms and passes
  the same scenario in74.6s. Product launch/display settings/assertions/budgets
  are unchanged. This is not an application performance benchmark. Raw failures
  and separate independent PID/start/cgroup/expired-timer exit proofs remain;
  normal cleanup encountered an already expired `/proc` PID/timer.

### Resource and release boundary

Runs are serial and zero-swap: tests2GiB/typecheck4GiB/lint6GiB ceilings, actual
peaks529MiB regression/234MiB focused/1.6GiB typecheck/3.5GiB lint. Native actor
and actual owned groups each have2GiB/deadlines; final actor peak1.1GiB. No ML
runtime/model copy, download or weights mutation is involved. Idle payload
cleanup is recorded in `cleanup.json` and lifecycle manifest; compact reports,
PNG/Save/import-fault evidence and existing shared dependencies are preserved.
Eight confirmed-idle native payloads were removed, reclaiming97,259,520 allocated
bytes (92.8MiB). Current compact evidence is20MiB; artifact root remains28GiB.
Existing27GiB shared ML dependencies are untouched. Historical compact evidence
1.3GiB exceeds its soft budget and remains pinned to open promise qualifications;
the exception and review checkpoint are recorded in the lifecycle manifest.

Backward reading is qualified; older strict readers' forward compatibility is
not claimed. Padding0..512 is an engineering guard. Local Invoke checkout
`9e1540962bcca7f8fa668d7d8e02cf79d75fda3b` uses blur initial16/min0/inputMax512
in `ParamMaskBlur.tsx`: a UI range reference, not inference parity. Inpaint blur,
accepted variants/staleness, compositing, Regional Guidance, Patch presets and
release remain future owners. PP-007/008 stay «Пока не обещать»; this slice is complete.
