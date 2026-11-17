# Current Anima prompt qualification

Base `3c1d42ec95576c74519ea7cc02683ca29b2b8d02`. This change repairs executable
qualification at the PP-005 provenance boundary. Frozen-format parsing, sampler
defaults and renderer behavior retain their existing contracts.
[Product promises](../product-promises.md#pp-005-принятый-результат-хранит-настройки-генерации),
[Anima fragments and legacy compatibility](./phase-4-anima-fragment-parity-research.md).

## Captured contract and failure

The retained database-backup baseline reproduced the same 81 failures in 22
complete files at `ceb16f66`. Sixty failed on the fresh frozen context schema.
The other 21 reached a comparison against a legacy compiled negative prompt.
[Previous reproduction](./phase-5-database-migration-backup-research.md#results-and-limits).

The clean InvokeAI checkout at `4875d96531ca6712b288f6e660fcbb34143408c1` was reread:

- `invokeai/backend/anima/prompt_weighting.py` joins adjacent parsed fragments
  with a neutral separator, merges adjacent equal weights and keeps plain
  fallback text source-exact. The fixtures use Studio's accepted `(text:weight)`
  syntax. The equivalent Invoke explicit suffix is `(text)weight`.
- `invokeai/app/invocations/text_encoder/anima_text_encoder.py` sends the
  cleaned string to Qwen3 and the string plus weighted ranges to T5. The caller
  `invokeai/frontend/webv2/src/features/generation/core/graph.ts` routes concrete
  positive and negative text independently to the encoder. The Anima denoiser
  consumes the resulting T5 IDs and weights in
  `invokeai/app/invocations/anima/anima_denoise.py`.

Main captures concrete raw signs and a versioned compiled worker command in
`anima-queued-generation.ts`. For new ordinary TXT, IMG and OUT, the exact
frozen context requires `animaPromptInterpretation: 'invoke-fragments-v1'`.
Regional capture checks agreement with that same ordinary base. Smart Patch
owns its corresponding marker on the manifest and queued item, including during
projection and revalidation. Previously frozen ordinary and Smart work with no
marker selects the legacy compiler during parsing and Retry. The worker command
keeps `anima-prompt-weighting-v1`. Portable provenance takes the concrete raw
signs through `project-generation-provenance.ts`.
[Ordinary capture](../../src/main/projects/anima-queued-generation.ts),
[regional capture](../../src/main/projects/anima-regional-queued-generation.ts),
[Smart manifest](../../src/main/projects/smart-patch-frozen-input.ts),
[Smart queue](../../src/main/projects/smart-patch-queued-generation.ts),
[provenance](../../src/main/projects/project-generation-provenance.ts).

## Updated boundaries

The five reusable TXT/IMG/OUT oracles now require the exact fresh marker and
retain complete context, command, sample-plan and portable-configuration
assertions. DPM++ 2M and other image methods inherit the Heun envelope. Image
batch, per-prompt and seed/reuse profiles inherit the dynamic-image envelope.
Common text batch-cap and seed-boundary profiles reuse the dynamic TXT envelope.
The direct installed Anima regression used a synthetic old DTO that hid the same
gap. Its oracle and fixture are corrected together.

The raw weighted fixture stays `(blurry:0.7), low quality`. The independently
authored command expects `blurry , low quality`, with spans `[0,6,0.7]` and
`[6,20,1]`. The corresponding noisy spans end at 5 and 19. Plain PI1 still
expects `blurry, low quality` with one neutral span `[0,19,1]` and the new marker.
The six actual Main caller matrices keep their own literal recipe and provenance
controls. Normalizers retain marker, raw text and compiled bytes across captures.

Historical native reports are pinned evidence for their original scope. Six
examined healthy baselines (dynamic IMG/OUT, Heun IMG/OUT, ER-SDE 3/5) contain an
absent marker and the old compiled string. Fresh controls, restored comparisons
and replay require corresponding modern baselines and their exact source/bundle
dependencies. Keep the historical report bytes and strict lineage checks.

## Verification

The focused run exercised 27 files with **315 passed, 0 failed, 0 skipped**.
Its TAP names independently match every case in the retained list of 81 prior
failures. It includes real persisted-input legacy reopen, Retry, dispatch and
candidate provenance, and marked/unmarked Smart sidecar preservation. Current
image assertions also reject absent/unknown markers, old compiled text and
offsets in fresh work, and operational marker leakage into accepted config.
Three parser-only controls against the current Invoke source match the weighted
and plain literal text and spans using Invoke's own suffix grammar.

An isolated mutation routes newly marked preparation and revalidation through
legacy joining. The actual Main IMG and OUT captures reach the independent
literal assertions and fail on the missing space and shorter span. Both plain
PI1 neighbors pass. Original and restored runs each pass all four cases with
byte-identical compiler and oracle sources. An earlier fixture setup omitted the
required ICC file. Its four setup errors are retained separately from the two
semantic failures.

Independent source review and a read-only audit of the focused/mutation logs,
source pins, old failure parity and process exit records found no mismatch.
Those reviews cover the recorded bytes and source. The test and mutation
executions are Root evidence. The two owned scratch paths were released after
the audit and exact restoration, reclaiming 30,269,440 allocated bytes.

The complete `app:test` manifest ran all **470 files in nine disjoint
partitions**. The stock runs completed with 8,355 PASS, 115 SKIP and zero
fail/cancel/todo. All nine Node invocations exited zero. The outer runner
reported unresolved fixture skips until two separate opt-in partitions used
the hash-verified 17 config files and shared pinned LaMa. Their 295 runtime
and 218 Project passes include all 114 exact stock fixture-gated cases. Counting
each stock case once gives **8,469 PASS, one inapplicable platform SKIP, zero
FAIL**. The two opt-in partitions exited zero. All 11 groups physically
stopped, with peak 2.6 GiB and zero swap. Typecheck and changed-script lint passed.

The partition manifest, complete TAP footers, pinned fixture inputs and exit
receipts are in `runs/anima-qualification-oracles/20261118/app-test`. The
supplemental coverage report records the exact overlap by title. The two
partition runners' idle TMPDIRs reclaimed 26,112,000 allocated bytes, and the
shared LaMa identity and bytes match both observations.

The primary retained evidence is under
`~/.codex/artifacts/imagegen-studio/runs/anima-qualification-oracles/20261118-focused`.
This stage exercises CPU fixtures and actual Main owners at their tested
boundaries. A fresh installed GPU result, visual acceptance and shipping
acceptance remain separate gates. See the
[MVP acceptance backlog](./mvp-acceptance-backlog.md).
