# Anima fragment joining and frozen interpretation compatibility

## Trigger and source

Base: clean `d7b462ed27005113de6ba3a8cb03a6253a99dfcc`. The
[direct Invoke control](./phase-4-regional-guidance-anima-invoke-control-research.md)
found different cleaned text and Qwen/T5 IDs for identical weighted-group/comma
prompts: `red scarf, one white cat` versus `red scarf , one white cat`.
This repairs preparation, not the separately unqualified visual result.

Re-read clean InvokeAI `a61ac4fb75bec78d92885bf39bcf3ed3900a9bdd`:
`invokeai/backend/anima/prompt_weighting.py`, its caller
`invokeai/app/invocations/text_encoder/anima_text_encoder.py`, the matching
frontend `invokeai/frontend/webv2/src/features/generation/core/prompt/ast.ts`,
and `invokeai/app/services/session_queue/{session_queue_common,session_queue_default}.py`.

Adapt native fallback-comma ownership, authored `glue` and final neutral joining
to this project's grammar and code-point spans. Existing bare-group, colon/
suffix, escape, refusal and Unicode-whitespace lexical semantics remain; full
replacement with current Invoke grammar is outside this change. Exact parity
below covers common recognized grammar and ASCII boundaries with Unicode text.

## Behavior and preserved work

Top-level plain fallback owns its trailing comma. Parsed suffixes/groups and
group punctuation stay separate leaves. Authored whitespace glues leaves.
After inherited weights are complete, otherwise adjacent nonglued fragments
receive U+0020 with weight1. Plain prompts without markup keep their spacing.
There is no comma regex or second Python parser.

`(red)2,blue` becomes `red , blue`; `red,blue+` becomes `red, blue`; plain
`red,blue` stays exact. `((red)2(blue)3)4` gives `red blue` with weights8/1/12.
Authored group spaces inherit weight, generated separators stay neutral.
New adjacent colon groups also separate: `a(b:2)c` becomes `a b c`. Authored
editor/Project/preset/provenance text remains exact. Existing16KiB/nesting128,
finite/underflow,64KiB command and128KiB frozen-input bounds are unchanged.

Queue/OUT and Smart validators recompile raw text to check stored spans.
Replacing the default alone would invalidate old Retry and candidates. Preserve
that corruption check through an optional Main-owned declaration:

- New ordinary/OUT frozen **context** and Anima Smart manifest/queued **root**
  store `animaPromptInterpretation: "invoke-fragments-v1"`.
- Absence selects preserved legacy concatenation. Unknown markers and mismatched
  raw/compiled pairs refuse. Every Smart projection preserves value or absence;
  resource requalification uses the same declaration, not today's compiler.
- Illustrious does not acquire the declaration. Captured old commands are not
  rewritten; no current Project read is introduced into Retry.

Invoke serializes concrete raw session/graph inputs; Studio additionally freezes
compiled meaning. This metadata adapts that stronger product contract. No DB
migration or worker command change: `anima-prompt-weighting-v1` remains the wire
format, Python consumes supplied text/spans directly. The operational marker
does not enter portable accepted provenance, Compare or result-derived presets.

## Executed evidence

Initial focused regressions reproduce2 PASS/10 RED; repaired targeted tests all
pass. Literal legacy goldens retain previous comma/group/Unicode spans. Execute
the original Invoke parser on153 fixed common-grammar cases: current output
matches **153/153** exact cleaned strings and complete spans; baseline59/153.

The retained focused run has **320 Main/TS PASS**, zero failures/errors/skips.
**38 Python PASS** use bundled tokenizers and small native Qwen/adapter models.
Three new actual-TS→Python cases independently execute current and literal
legacy v1 inputs, with different Qwen/T5 IDs and finite weighted output. The
historical Unicode bridge explicitly selects its legacy interpretation.

Six genuine SQLite/files cases cover marked TXT/IMG capture; literal old TXT/
IMG close/reopen→Retry→worker lease→candidate publication; queue pruning→second
reopen→verified candidate/provenance projection; and old/current Smart admission/
resource verification→Retry→pruning→reopen. Current authoring is independently
poisoned; complete JSON, signed spans, marker presence/absence and files stay
exact. Model-file resolvers/PNGs are declared fixtures, not trained inference.

A separate earlier six-file run has135 PASS/2 explicit LaMa-dependent OUT skips;
it overlaps the320 and is not added to that count. It includes tiny native Smart
execution. No new trained GPU, installed-worker, legacy Add/Save or visual
acceptance is claimed; current accepted-persistence neighbors are in the320.
`pnpm run typecheck`, scoped ESLint, Ruff and strict BasedPyright pass.

Isolated parser mutations kill omitted joining (59/153) and nonneutral separator
(87/153), with plain controls GREEN. Routing missing-marker validation to current
compilation kills the literal legacy control. A bundled real-SQLite intervention
gives **5 GREEN → 3 semantic RED +2 controls GREEN → 5 restored GREEN**. Healthy/
restored bundle hashes match; live repository sources never change. Failures
occur at intended persisted-input consumers, not import/setup/timeout boundaries.

The first ad hoc comparison helper used JSON string equality on objects with
different key order and falsely reported legacy RED; it is excluded. The retained
corrected driver uses structural equality and records all controls.

## Limits and retention

Run: `runs/anima-fragment-joining/20261107-parity`. Retain source pins, original
Invoke parser outputs, corpus, JUnit records, drivers/bundles and mutations.
Reuse the existing runtime; no model/environment copies or downloads. Bounded
units have zero swap and physical exit records. Generated DB/files clean up
through fixture owners. Only verified idle own scratch may be released after
source/reader/dependency gates, retaining RED/control/restoration bytes.

Independent frozen12-file source review is CLEAN at manifest
`8bb52df98b7d5c3e20349da6b31037527817f5ebbb141b2b9ce924a3c1ad3a35`.
It does not rerun tests or establish full grammar parity. Documentation/retention
verification and ROOT's physical release remain separate.

Public Anima regional activation, spatial negatives/references, Smart regional
guidance, visual usefulness, installed/release capacity and PP-001/005/007/008
**«Пока не обещать»** remain unchanged.
