# Internal frozen outpaint jobs and Main auxiliary resource ownership

Research base: `1944c665b85db0c8585e2540c09f4fd64a0ad42b`, clean `master`,
2026-10-06. This continues the internal
[Illustrious](./phase-2c-illustrious-outpaint-research.md) and
[Anima](./phase-2c-anima-outpaint-research.md) masked executors.

## Scope and risk

Persist exact mixed-alpha inputs for both families and preserve them through
local queue restart and internal Retry. Add Main's fixed installed LaMa resolver.
This is an internal checkpoint: public mixed-alpha Generate, outpaint worker
commands/capabilities, RGBA publication and portable accepted outpaint provenance
stay closed. First-engine auxiliary installation is still a subsequent installer
boundary, under the already accepted full-volume/upfront installation decision.

Risk is high: strict durable schema, SQLite migration, immutable target ownership,
resource preflight, atomic batch publication and Retry cross persistence boundaries.
Sources are [PP-005/007/008](../product-promises.md),
[frozen jobs](../features/queue-manager.md#frozen-job-rule),
[normal generation](../features/project/generate-mode/generation-actions.md),
[provenance](../features/project/generate-mode/generation-provenance.md),
[auxiliary resources](../specs/07-python-runtime-management.md#общие-вспомогательные-веса-для-outpaint),
[research](./research-protocol.md) and [review](./review-protocol.md).
No new product decision was needed.

## Confirmed baseline and selected design

- SQLite migration0014 and the queue/manager schemas admitted four operations.
  Migration0015 preserves those rows, their statuses/sequences/error details and
  independent candidate receipts/seed cursor, admitting two explicit internal
  operations: `illustrious-outpaint` and `anima-outpaint`.
- Existing preparation rejects mixed alpha. Keep those public entrypoints closed
  and add explicit internal constructors which capture the real composite before
  awaits. Do not fabricate an opaque carrier PNG or reinterpret outpaint as
  ordinary img2img. Anima retains its existing numerical img2img plan inside the
  explicit outer outpaint operation; this adds no solver or noise schedule.
- Strict context includes the actual source PNG identity and sRGB profile, bbox,
  alpha8 keep-mask size/dimensions/hash/polarity, exact versioned policy and pinned
  LaMa role/hash/size. Cross-field checks bind context, target metadata and numerical
  worker job to the same captured source. The full PNG stream is validated and
  its original alpha rederived; matching caller-provided hashes alone are insufficient.
- Store one owned `target.png`. Raw alpha is deterministically recovered and
  verified from its bytes, rather than storing a second potentially divergent
  mask asset. Frozen payload includes concrete prompts/seeds, exact family
  resources and sampling/advanced settings. Later Project edits are irrelevant.
- Admission captures all items before await, validates the whole batch and exact
  model/auxiliary resources, then publishes existing owned input manifests and SQL
  together. An explicit internal staging capacity preflight uses the actual
  candidate/manifest ceilings without allowing candidate publication.
- Internal Retry verifies the retained payload and PNG/derived alpha, requalifies
  exact resources and copies the old frozen JSON/bytes. New request identity is
  allowed; new prompts, randomness, current draft or changed LaMa policy are not.
  Restart keeps canceled frozen inputs retryable; it does not resume inference.
- Main auxiliary bytes belong at `appData/inference-resources/big-lama.pt`, outside
  replaceable Python environments, clearable cache and `.igs`. The production
  resolver accepts only the pinned LaMa manifest, hashes a bounded regular file
  through a descriptor, checks before/after identity and refuses links, absent,
  truncated or changed bytes. It does not install/download the resource.
- Baseline dispatch and provenance contain unknown-operation-to-txt2img defaults.
  Add explicit outpaint gates before scratch/materialization/worker calls and
  before accepted provenance/journal/document/sibling/discard actions. Public
  Retry, staging publication/recovery and worker transport remain closed.
  Queue Manager can describe the new operations without enabling execution.

## Findings resolved during source-aware review

The shared Illustrious preparation read `lastActualSeed` and target mode after
awaiting embedding checks. A held-promise reproduction changed the retained
Reuse seed from1 to99 and observed99 in the frozen job. Capture scalar inputs
and collaborator references before the first await; cover Reuse0 and ordinary
preparation too. Anima's exported async pixel assertion also needs detached
metadata/bytes before awaits.

Resource checks inside a Kysely transaction can deadlock: the real Main
ModelService queries the same SQLite connection whose mutex the transaction owns.
File-only model collaborators do not reveal that failure. Keep DB-backed model
and auxiliary preflight outside the queue transaction; retain atomic row/CAS
publication inside it. A same-database query regression verifies this production
ownership seam. Files can change externally after verification; the later worker
dispatch must verify their exact identity at use, as ordinary dispatch already does.

The original per-item model/LaMa preflight repeated common forced hashes twice
for every job: a32-job batch would read the known6,938,040,706-byte checkpoint
64times (about444GB) and LaMa about13.2GB. This is a loop/manifest-derived cost,
not a throughput measurement. Boundary-local typed memoization now shares exact
reference checks within each phase; a real32-job counter regression observes
two model and two LaMa resolutions. Final phase, Retry and later admissions get
fresh checks; active embedding subsets still require complete agreement.

The inherited queue reader checked `fstat` size before unbounded `readFile`.
A concurrent writer could grow the file after that check. It now allocates at
most the captured ceiling+1, reads at most64KiB per descriptor call and refuses
the overflow sentinel. Actual file-growth tests record requested/consumed bytes
for manifest/target across ordinary and outpaint neighbors, then restore the
input and verify unchanged source/status. Hash/inode/time checks remain intact.

Review here is source-aware peer review plus self-review, not a blind audit.

## Parameter register

| Parameter              | Existing authority             | Value and refusal                                                                                                        |
| ---------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| Source target          | queue and actual PNG validator | PNG32MiB; side2048, pixel count4,000,000, 8-pixel grid; invalid stream/profile/alpha refused                             |
| Family admission       | existing generation validation | Existing family dimension/strength rules retained, including minimum64; tiny helper inputs do not relax public admission |
| Frozen JSON            | queue and staging format       | 128KiB per item; oversized batch refused before publication                                                              |
| Queue input manifest   | queue format                   | 4096bytes per manifest; bounded read/write retained                                                                      |
| Batch admission        | existing queue planning limit  | 32jobs; a33rd item refuses before rows/input directories                                                                 |
| Future staging session | existing staging limits        | 64candidates and 8MiB manifest, real capacity preflight before admission                                                 |
| LaMa                   | fixed Main manifest            | 205,669,692bytes, SHA256 `344c77bbcb158f17dd143070d1e789f38a66c04202311ae3a258ef66667a9ea9`; exact size/hash required    |
| Descriptor hash buffer | local verifier                 | At most1MiB; read at most declared size+1 to detect growth, no unbounded artifact read                                   |
| RGBA publication       | next checkpoint                | Still unsupported; no candidate/accepted record may claim public outpaint completion                                     |

These are existing safety/format ceilings or the pinned artifact identity, not
measured performance targets or a new supported hardware capacity claim.

## Failures and neighboring controls

Malformed context, changed soft alpha or coherent tampered hashes are rejected
using actual pixels. A later invalid batch item, oversized manifest, missing or
changed model/LaMa must not leave rows or owned input directories. Interrupted
admission retains the existing queue transaction/cleanup rules. Retry must not
consume its source on failed verification. Restart preserves exact frozen bytes
without completing receipt/seed state. Outpaint dispatch/public Add must refuse
before worker or destructive staging/document effects. All four ordinary
operations remain admitted and ordinary paths retain their existing tests.

## Executed evidence

Artifact root:
`/home/user/.codex/artifacts/imagegen-studio/outpaint-jobs-2026-10-06/`.

The real local LaMa qualification copies the previously pinned artifact into an
isolated application resource root and enters the production resolver. Exact
bytes are accepted; one-byte same-length corruption is refused; restored bytes
are accepted on a fresh resolver. This is explicit developer provisioning, not
an installer, Python load or model generation qualification.

Actual pinned Main LaMa also enters each family's real internal queue admission
and typed Retry. Frozen JSON and target bytes are identical in the new attempt;
attempt, batch, session and status metadata are new while generation fields stay frozen. Tiny model collaborators remain explicit;
this does not execute either ML pipeline. Reports and retained source PNG/payloads
are in `real-auxiliary-queue/`.

| Boundary               | Executed result                                                                                                                                                                                              | Limit                                                                                   |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| Conditioning/resources | 120/120, zero skips: real PNG/soft-alpha/ICC, local descriptor changes, bounded queue reads, same-DB32-row admissions and fresh qualification phases                                                         | Small model/LaMa collaborators in queue probes; actual pinned LaMa separately qualified |
| Durable queue          | 25/25, zero skips: actual SQLite reopen/Retry, captured Reuse0/1, weighted Anima signs, source/mask/policy corruption, failed/lost publication, embedding subsets,32/33 jobs, real128KiB and8MiB serializers | No worker invocation or accepted RGBA                                                   |
| Consumer controls      | 253/253 targeted ordinary/new regressions; new8 consumer cases plus6 shared DTO tests                                                                                                                        | Public outpaint gates refuse execution/publication/Add                                  |
| Migration              | Real four-operation/five-status preservation, independent receipt/seed0, indexes/integrity and reopen; all12 database tests passed                                                                           | No production user database modified                                                    |
| Real local auxiliary   | Exact205,669,692-byte pinned LaMa accepted, same-size corruption refused, restore accepted; both-family internal queue/Retry passed                                                                          | Explicit isolated developer copy, not installer or ML execution                         |
| Semantic mutations     | 28/28 distinct selected defects detected; every restored selected control and full controls passed                                                                                                           | Isolated scratch sources; sensitivity of selected invariants, not completeness          |
| Full regression        | App1766/1766; Python924/924; zero failures/cancellations/skips                                                                                                                                               | Python unchanged; existing inference controls retain their previous boundaries          |
| Static/build           | Full prototype+app TypeScript, ESLint, scoped Prettier, diff check and desktop build passed                                                                                                                  | Development build, not release packaging                                                |
| Native neighboring UI  | Built Electron Generate/Add/Save/reopen/comparison/Cancel/Retry and Anima six-method Queue Manager controls passed                                                                                           | Controlled runtime/output and tiny exact resources, no GPU/public outpaint claim        |

Mutation reports: `mutations/report.json` (7 conditioning/resource),
`consumer-mutations/summary.json` (9 consumer/DTO), `queue-mutations/report.json`
(9 queue/capture) and `final-boundary-mutations/summary.json` (3 final allocation/DB
boundaries). The two DB mutations move actual resource qualification back inside
SQL transactions: both-family probes are killed by the bounded harness and parent
assertions record `killed:true`/`SIGKILL`; no import/collection failure counts.
Controls after restoration pass. The extra peer-review old-reader reproduction
is redundant and is not added to the28 distinct mutation count.

The first standalone auxiliary/queue script had an invalid fixture project-key
setup, and the first queue-mutation runner hit pnpm's noninteractive workspace
install guard. Corrected successful runs and original setup logs are retained;
neither failed setup counts as a behavioral mutation or delivered verification.
Final source identities, check logs and delivered commit are indexed in the
artifact `delivery-manifest.json`.

## Remaining coupled execution slice

Connect exact resource materialization to explicit family worker commands and
capabilities; produce/verify the policy-bound RGBA contribution; publish recoverable
candidates; add immutable portable outpaint provenance/comparison; then enable
public mixed-alpha Generate and qualify installed trained Generate/Add/Save/reopen.
Signed release Install/Repair/update/rollback and automatic auxiliary delivery
remain separate gates. Authored masks/Regional Guidance/Smart Patch remain phase4.
PP-005/007/008 stay «Пока не обещать» and phase2C remains incomplete.
