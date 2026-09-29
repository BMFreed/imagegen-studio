# Phase 2B: accepted Raster provenance storage

Checkout before this change: `e13d759` (29.09.2026), clean worktree. This is a
high-risk `.igs` and recovery boundary for PP-005 and PP-008. The supporting
[provenance contract](../features/project/generate-mode/generation-provenance.md)
requires immutable settings on an **accepted** result, while
[Generation Results](../features/project/generate-mode/generation-results.md)
keeps an unaccepted candidate outside the portable Project. The current
production `RasterLayer` schema has no provenance field; `Save Candidate Image`
exports pixels separately and does not fill that gap.

## Scope and data path

This checkpoint adds a strict, versioned, optional Illustrious `txt2img`
provenance record to a Raster Layer in `project.json`, plus a mapper from a
verified staging candidate's frozen job context. It does **not** connect the
candidate to a layer yet. The record carries exact model identity and actual
prediction type, worker-used prompt/sampling/seed, frozen bbox, source document
and target identity, and output identity. It excludes local worker/model paths
and Regional Guidance. Imported/manual layers keep no provenance.

The record is inline with the layer, so the existing package and dirty shadow
document serialization own it together with the layer. No separate provenance
asset or derived SQLite history index is introduced here. Existing v1 documents
without the optional field must still open. This is an explicit pre-release v1
schema extension: an older strict reader may reject a new file rather than
silently rewriting unknown provenance. Schema versioning for a later public
format must account for that compatibility boundary.

## Invariants and failure analysis

| Trigger | Required result |
| --- | --- |
| Old Raster Layer without provenance | Parse/save unchanged; do not invent generation data. |
| Valid accepted provenance in document/shadow | Survives package Save/reopen and dirty recovery with layer identity intact. |
| Malformed or unsupported provenance | Reject the document; never treat it as a provenance-free layer. |
| Candidate frozen payload contains local filesystem paths | Mapper emits only portable identity/configuration fields. |
| Candidate/result identity, bbox, seed or hash disagrees with frozen payload | Mapper refuses the record rather than attaching false settings. |
| Document edit changes layer display properties | Existing provenance remains byte-for-byte the same. |

The staging payload is limited to 128 KiB and each output PNG to 32 MiB by
`generation-staging.ts`. The `.igs` `project.json` ceiling is 16 MiB. Inline
provenance counts against that ceiling; the resulting maximum number of large
records is not measured. Free disk space and interruption timing remain external
unknowns. This checkpoint does not write an accepted image or delete staging,
so it cannot claim a crash-safe acceptance handoff. That later operation must
durably publish document/shadow and make retries idempotent before clearing a
candidate.

Alternatives considered: a separate provenance JSON member would decouple
`project.json` size, but it adds a second asset reference and more package/shadow
handoff states before the first accepted result. An untyped copy of the frozen
worker payload would leak local paths and make settings comparison depend on an
operational request format. The inline typed record keeps the first storage
boundary inspectable; future schema versions can migrate it if real size data
demands separate members.

## Verification plan

Run focused schema/mapper and real package/shadow tests, then `pnpm run
app:test`, `pnpm run typecheck`, `pnpm run lint` and relevant Electron smoke if
the runtime path changes. Test a neighboring manual layer, package Save/reopen,
dirty shadow recovery and malformed input. An isolated mutation that removes
provenance during serialization or bypasses identity validation should make a
focused test fail. Update this note with executed evidence and remaining gaps.

## Review evidence (29.09.2026)

This is a self-review of the dirty working tree based on `e13d759`, not a
published commit. `RasterLayer.generationProvenance` is optional, versioned and
strictly parsed. The first variant is Illustrious `txt2img`; unknown fields,
malformed model IDs, timestamps, hashes, sizes, ICC or region data reject the
document rather than silently deleting provenance. The shared 32 MiB generated
PNG ceiling is used by both staging and the portable record. A main-only mapper
reuses staging's strict frozen-payload parser, verifies candidate/project/job
identity, bbox, seed and exact output bytes, then projects only portable fields.
The accepted-result identity is the owning Raster Layer ID; the record stores
candidate and queue origin IDs separately.
The mapper rehashes bytes supplied by staging; PNG structure/color verification
belongs to staging's verified read. Calling the mapper with an arbitrary buffer
is not a substitute for that read in the later Add service.

`pnpm run app:test` passed 421/421 (0 failed, 0 skipped); `pnpm run typecheck`,
`pnpm run lint`, `git diff --check` and the complete `pnpm run app:smoke` passed.
Focused real-storage tests verify that a generated layer and its PNG survive
dirty shadow recovery, explicit Save, `.igs` copy/reopen and an opacity edit;
the old `.igs` bytes stay unchanged before Save. Legacy layers without the
optional field still parse. The smoke suite covers existing desktop behavior,
not a user-facing Add action, which does not exist yet.

Two isolated semantic mutations in temporary copies were executed and removed:
replacing provenance validation with an unknown-value acceptor made one schema
test fail (seven controls passed), and deleting provenance during a Raster
property edit made the new service integration test fail at shadow recovery.
These checks show sensitivity to both parse and preservation regressions; they
do not prove the later staging-to-document handoff.

Next, acceptance must bind a verified candidate and a stable layer ID to the
open document, flush the shadow before staging cleanup, make retry idempotent
after a partial failure, group undo for multi-accept, and derive history only
from accepted saved results. The runtime installer, full inference pipeline and
ordinary-user Generate remain separate open work.
