# Data And Storage

## Продуктовая граница

ImageGen Studio остаётся однопользовательским desktop-приложением и в MVP, и после MVP.

Проект не планирует развиваться в сторону:

- server mode как основного режима работы;
- multi-user collaboration;
- hosted backend;
- tenant/user management;
- remote shared database.

Это важное ограничение влияет на выбор persistence-слоя: локальная embedded database предпочтительнее клиент-серверной БД.

## Current local relocation identity checkpoint

[Clean-open Move and closed Rename](../engineering/phase-4-open-project-relocation-research.md)
extend the existing journal with live rebind and operation-kind/expected Rename
metadata. Migration0029 preserves legacy Move rows; no portable schema version or
immutable generation payload changes. Rename uses exact existing members/preview
through the IGS writer. Open title/Undo Rename and release migration remain gaps.

[Closed Project Move](../engineering/phase-4-project-workspace-move-research.md)
preserves an existing opaque local Project key while authoritatively binding its new
physical canonical path. Ordinary legacy paths retain their compatibility path hash;
reused locations get a distinct durable binding after package validation. SQLite0028
loads active bindings/retired keys before any consumers, journals pending relocation
and repoints mutable queue/receipt paths without changing frozen bundles, seed,
shadow bytes or portable `.igs` provenance. These local identity/lifecycle records
are authoritative app state independent of the derived Home index; `.igs` remains
the document/pixel/settings source of truth. Index rebuild cannot reconstruct lost
local ownership, queues or lifecycle intent. After permanent deletion, the location
is released and the old key retired so a different file cannot inherit its history.
No physical old-path redirects or virtual filesystem locations are created.

## Источники истины

SQLite — источник истины для:

- installed resources;
- derived global history index of accepted generated project results and recoverable project index for Home;
- Queue Manager runtime/history records: queue items, batches, status, progress, errors and serialized worker job payloads;
- project-scoped operational last-actual-seed cursor, updated on validated
  completed outputs independently of queue and staging retention;
- pending acceptance intents with exact captured staging sessions and expected
  immutable accepted layers, independently verified against shadow/`.igs` before cleanup;
- presets;
- references на файлы изображений, масок и моделей.

Project file `.igs` — источник истины для конкретного canvas-проекта:

- canvas document metadata;
- unbounded Project Canvas coordinate metadata, project-owned primary generation
  bbox and color/profile metadata;
- layer stack;
- raster layer assets;
- masks;
- generation settings and immutable generation provenance attached to accepted Raster Layers / Smart Patch variants;
- the last-actual-seed snapshot as of the most recent explicit Project Save;
- references на модели, LoRA, VAE и другие внешние ресурсы.

SQLite не хранит сам canvas project и его слои как основной документ. Производный Home index включает: путь к `.igs`, workspace id/path, project thumbnail cache key/path, last opened time, modified time, display name, нормализованное display name для поиска, optional `trashed_at`, file health `ready`/`missing`/`corrupt`/`unsupported_schema` и похожую служебную информацию. Home search в MVP ищет только по display name и не требует индексации prompts, model names или generation settings.

Project `open` state не хранится в index row: Home вычисляет его по in-memory document-tab registry. `recovery_available` отражает наличие валидированного незавершённого document shadow или completed staging recovery после сбоя, а не обычный autosave progress.

Queue rows are not project source of truth or generation result history. They describe operational jobs that produce temporary staging candidates. Completed queue rows can be pruned without deleting accepted project results or valid unaccepted candidate recovery: each completed candidate owns a separate durable manifest entry with its frozen generation context.

Seed `Reuse` takes the most recent completed output's actual seed for this same
Project, even when that candidate was subsequently discarded. Its local cursor
is operational metadata, not a document edit: job completion does not mark the
Project dirty or add an undo step. The cursor is keyed to the local Project
identity and checked against the open `.igs` `documentId`: replacing a
document at the same path cannot lend it the previous document's seed. It
survives graceful tab close, staging cleanup and queue pruning.
An explicit Project Save snapshots its current value into `.igs`; until then,
the newer local cursor stays on this computer. Opening a portable `.igs` without
a local cursor starts from its saved snapshot, if any. A copied `.igs` at a new
local identity does not inherit an unrelated local cursor. A managed Project
move migrates the local identity mapping along with the project index.

Файловая система хранит тяжёлые артефакты:

- checkpoint / LoRA / VAE / ControlNet files;
- generated images;
- `.igs` project files;
- workspace directories;
- derived thumbnail/cache previews;
- autosave shadow directories;
- app-managed generation staging recovery manifests and candidate assets;
- temporary exports/downloads.

Sidecar JSON рядом с пользовательскими изображениями и embedded metadata не входят в MVP. Project metadata хранится внутри `.igs`.

CivitAI API token is stored by Electron main process using `safeStorage`; only
its encrypted value may be persisted in app-managed configuration. The token is
not stored in SQLite, `.igs`, presets, queue payloads or logs. On Linux, if
`safeStorage` reports the unprotected `basic_text` backend or secure storage is
unavailable, the app refuses to persist the token and shows an actionable
connection/setup error. It must not silently fall back to plaintext storage.

## Workspaces и `.igs` project files

Workspace — обычная папка на диске. В MVP workspace не может быть вложенным workspace'ом: приложение сканирует только прямые `.igs` файлы в выбранной папке, а вложенные папки и файлы других форматов игнорирует.

Всегда существует дефолтный workspace `Uncategorized` как реальная app-managed папка `ImageGen Studio/workspaces/Uncategorized/`. Пользователь может перемещать `.igs` project files между workspace'ами. Проект не может существовать вне workspace в пользовательской модели, но физически `.igs` остаётся обычным переносимым файлом.

Новый проект без другого явно выбранного writable workspace физически создаётся в `Uncategorized`. При открытии `.igs` вне известных workspace'ов пользователь должен переместить или скопировать файл в `Uncategorized` либо другой выбранный workspace. До подтверждённого move/copy такой файл не индексируется и не открывается. Приложение не создаёт implicit workspace из родительской папки и не хранит внешние пути как виртуальные элементы `Uncategorized`.

Home использует app-managed Trash lifecycle с отдельной authoritative записью, независимой от производного index и workspace registration. `Move to Trash` сохраняет исходную canonical location и snapshot workspace, исключает Project из `Projects` и активных workspace counters и показывает его только в Trash. Restore требует зарегистрированную исходную папку и проверенный source; он не выполняет implicit Add и не подменяет workspace на Uncategorized. Физическое удаление managed `.igs` происходит только после отдельного `Delete Permanently` confirmation и сохраняет positive recovery intent при незавершённом purge. Финализация удаляет lifecycle journal, освобождает active location binding и retires local key; queue/recovery имеют своих владельцев. Открытый Project нельзя переместить в Trash.

`.igs` — переносимый рабочий формат ImageGen Studio. Базовый формат для MVP:

```text
project.igs
├─ mimetype
├─ manifest.json
├─ project.json
├─ preview/
│  ├─ thumbnail.webp
│  └─ merged.png
├─ assets/
│  ├─ layers/
│  ├─ masks/
│  ├─ references/
│  └─ profiles/
└─ provenance/
   └─ generation-*.json
```

Формат `.igs` проектируется как ZIP-пакет без обязательной compression. Обычный save может собирать новый archive во временный файл, валидировать его и затем атомарно заменять старый `.igs`.

Первый исполняемый формат фазы 2A использует точный `mimetype` payload
`application/vnd.imagegen-studio.project+zip` и `schemaVersion: 1` в
`manifest.json`. Manifest хранит portable `documentId`, `documentRevision`,
`preview.status` (`rendered`, `empty`, `unavailable`), preview rect и перечень
member paths с uncompressed byte size и SHA-256. `project.json` хранит тот же
document ID/revision, title, primary bbox, generation draft, ordered layers
с точными asset references и saved last-actual-seed snapshot. ZIP member names
и ссылки валидируются строго; неизвестное или более новое schema version
не переписывается молча.

The current [Regional Guidance reference-image owner](../engineering/phase-4-regional-guidance-references-research.md)
has **source implemented; finite native-r10 qualification PASS; retention/release
complete**. Core storage source and final lower checks are complete; the
finite native evidence below closes this bounded authoring checkpoint, not overall public readiness.
Its settled portable contract adds
optional, nonempty `region.referenceImages`, with no parser default/empty
wrapper. One authorized PNG/JPEG/WebP per Add creates one fresh globally owned
attachment UUID; cancel creates none. Array order is durable, equal-order move
is a no-op and remove-last omits the field. Each item stores `id`, `name`,
`sourceFormat`, `asset` and `thumbnail` descriptors with exact
`path/sha256/bytes/width/height`, plus optional `sourceIccProfile` with exact
`path/sha256/bytes`. No runtime URL or renderer source path is stored.

Canonical source PNG and full-frame thumbnail WebP have immutable hash-named
members under `assets/regional-references/<referenceId>/`; original ICC uses
`assets/profiles/<sha256>.icc`. The source/thumbnail roles and owner must match
the path. All-asset/profile collectors must retain both images and ICC through
adoption, package Save/rebuild, shadow and recovery, independently of Raster
composition/preview collectors. Exact bytes, hashes, content and dimensions
must be validated. Duplicate allocates fresh reference IDs/member paths and
copies verified bytes; ICC may retain existing immutable sharing. Delete/Undo
follow coordinator history retention without eager filesystem deletion.

Candidate publication, including Duplicate, must check the existing 16 MiB
project JSON, 4 MiB manifest, 10,000 ZIP-entry and 32 GiB aggregate ceilings,
counting unique asset/profile paths plus five non-asset ZIP members. There is no
new arbitrary reference-count capacity promise. Existing normalization ceilings
remain 256 MiB source, 16,384 per side, 64,000,000 pixels, 4 MiB ICC and 512 MiB
verified canonical output. The separate pinned-canonical-PNG CPU thumbnail
primitive produces full-frame lossless WebP, without crop/upscale, bounded to
128 per side and 128,000 bytes; legacy derivative/resource-preview APIs/caps
are preserved. These are defensive limits, not measured regional capacity.

Dedicated owner-bound import/update APIs accept no renderer paths, pixels or
asset descriptors. Capture/revision/epoch and lock/family checks must hold across
dialog/worker awaits and staged publication. Cancel/failure keeps the document,
history, package and neighbors unchanged. A separate signed regional-reference
namespace within `igs-layer` resolves only exact thumbnail ownership; runtime
`thumbnailUrl` never enters `project.json`. Ordinary Undo, explicit Save,
portable reopen after external source removal and dirty-image recovery retain
separate lower-level and finite native evidence boundaries, both recorded below.

Root reports **118 Python checks passed, 0 failed/skipped** at the CPU
thumbnail/import/derivative/resource-preview/protocol boundary only.

Root confirms **source implemented; lower-level checks and finite native-r10
qualification PASS**. Final lower checks are **Python 118 PASS**, post-lint
**typecheck-r3 PASS**, **full lint-r2 PASS**, **neighbors-r2: 952 PASS / 57 files /
0 skips**, and **fresh build-r1 PASS**. Later changes were harness-only, each with
syntax/format/scoped ESLint PASS. Earlier typecheck-r2 and neighbors-r1
950/57 preceded the final checks; neighbors-r1 predates the Save fix. The earlier
lint-r1's 196 autofixable ordering/braces errors in 16 changed files are historical,
not the final lint outcome.

The duplicate mutation records **2 GREEN → 1 semantic RED + 1 control GREEN →
2 restored GREEN**; all **1,343 mutation-source members** are restored.
Production **R2 source review is CLEAN** after the P2 Save A/B rebase fix and
external-replacement neighbor. Rebase requires full-document equality to exact
`baseDocument` or exact authorized `saveTarget`. The causal
`SAVED_PROJECT_CHANGED` assertion was unchanged when the explicit
Recover-new-revision test oracle was corrected; `save-rebase-green-r2` passed
both cases.

Final **native-r10: 12/12 PASS in 191.188 s**, script `1f5ac7ce`, with its
**R11 source review CLEAN**. The successful run uses the source-r2 archive
(1,343 members), exact script overlay and build-r1 (33 members). It observes
**882 Main calls, originals exactly once**, and **149 actual CPU children**
across two Electron lifetimes: intentional dirty SIGKILL, then healthy code 0.
Exact Main/dialog/spawn/kill/write restoration completes with zero in-flight
calls and zero page errors; root freshly confirms recorded PID/start identities
absent. Contract R1 is CLEAN source-only; final source/build/version mapping is retained.

Root actually opened **all 10 final screenshots** under `ui-audit`: 1440×900
and 900×620, reference cards, keyboard tooltips and recovered image states.
This bounded self-review found no material new reference-layout defect; it is
not independent review, full WCAG or all-compositor qualification.

Native attempts **1–9 remain FAILED**. Harness source-oracle findings R7/R8
were closed by subsequent code/reviews and successful replay; those failures
do not establish another product bug beyond the corrected Save rebase.

The OS picker result was controlled; the worker was the **actual development
CPU worker**, with no ML/catalog injection. Installed-resource transitions,
packaged-worker behavior, inference and frozen active work are not
native-qualified. Transient target/Smart-preparation outputs have metadata-only
witnesses, without raw replay. Prototype SVG/data URLs remain separate mock
behavior and do not extend this evidence boundary.

Retention **R1–R7 are CLEAN, candidate-only, READ-FINISHED**; contract **R1 is
CLEAN, source-only**. Root freshly verified source/build bytes, physical exits,
exact restoration, dependencies and all-reader completion, then released all
22 exact disposable paths: 2 unit and 20 native payloads. Measured artifact-root
allocation reduction is **216,420,352 bytes** (unit 35,950,592; native 180,469,760).
Compact evidence and external runtime/package dependencies remain protected.
Final source/build/version mapping is retained in the linked checkpoint.
PP-001/007/008 remain
**Пока не обещать**; finite qualification does not promote public readiness.

The failed-attempt chronology retains these corrections: normal CPU SIGTERM
was initially mistaken for a required code-0 exit; unrelated background variants
CPU work was counted as import; stale variants reads needed their exact current
successor; an NAlert title was assumed to be a heading. Manual viewport changes
still recenter: the corrected oracle independently measures the notice, viewport
and world-centre law. A JPEG fixture's double ICC was corrected without weakening
the worker, family checkpoint names became unique, and tooltip lookup uses the
actual `.n-tooltip` element. Attempts 1–9 are not retroactively counted as PASS.

The prototype's SVG/multiple data URLs do not prove durable storage. No SQL/model
policy, conditioning/inference, accepted provenance or automatic Save expansion
is included. PP-001/007/008 remain **Пока не обещать**; the earlier checkpoint
records below retain their original scope/evidence.

The [Regional Guidance owned-mask checkpoint](../engineering/phase-4-regional-guidance-masks-research.md)
has **source implemented, lower-level checks and finite native-r7 qualification
passed**; local visuals are root-reviewed and retention/release are complete.
Regional `mask` adopts
the existing strict owned-mask union:
`{ id, revision, asset: null }` or `{ id, revision, bounds, asset }`, with immutable
white-RGB/alpha PNGs under `assets/masks/<maskId>/<sha256>.png`. Bounds are integer
world-pixel coordinates, independent of every generation bbox. Shared asset
collectors, package membership/PNG validation, shadow and Save include regional
masks; raster composition/preview collectors stay unchanged. Duplicate allocates
fresh owner IDs and a copied member path; historical Undo bytes stay with the
existing coordinator rather than being eagerly deleted.

The dedicated geometry-only edit envelope captures document/mask revisions;
Main checks lock, coordinator/epoch and staged publication. Runtime-only signed
`igs-mask://regional/...` display URLs never enter portable JSON. Smart resources
retain their separate namespace and resolver. No SQL migration, reference-image
asset, worker conditioning, accepted provenance or implicit Save is introduced.
Root's Node, post-lint and build checks PASS at the source boundaries recorded in
the linked research; production R2 is CLEAN, source-only. Prototype r2 passes 182
mock/shared-consumer checks and does not qualify production persistence. Root's
final native-r7 passes all 12 checks in 157.061 s, including actual Save/read/reopen
and dirty-PNG crash → Recover → Save/reopen with exact coverage, geometry, history
and owner/resource controls. Both lifetimes restore all 95 handlers with zero
in-flight calls/page errors. Root's six final screenshot reviews are bounded local
self-review, not a full accessibility audit. Earlier failures retain native3's
instrumentation restoration gap. All four retention audits are CLEAN/READ-FINISHED;
contract R2 is CLEAN source-only and final harness-scoped lint passes. Root
release checks and exact cleanup are complete: 15 idle paths, 113,537,024 bytes
(108.28 MiB), with retained compact bytes and protected external dependencies. Earlier
descriptions below are historical.

[Regional Guidance foundation](../engineering/phase-4-regional-guidance-foundation-research.md)
extends pre-release v1 with optional `regionalGuidance`, separate from `layers`.
At that checkpoint, strict empty entities contained only `id`, `name`, `enabled`, `locked`,
`overlayOpacity` and `mask: { id, revision: 0, asset: null }`. Unknown fields,
nonempty assets and future mask revisions refused at that checkpoint. Entity/mask identities join the
same current-owner namespace as layers and nested variants; no regional PNG,
provenance, SQL migration or worker payload is added. Missing collection stays
missing through legacy Open/no-op Save; deleting its final owner omits the field.
The new reader accepts legacy packages; older strict binaries reject the new
field. Regional inference and nonempty masks remained outside that foundation schema.

The subsequent [Regional Guidance authored-prompts checkpoint](../engineering/phase-4-regional-guidance-prompts-research.md)
adds only optional `prompts: { positive: GenerationPrompt | null;
negative: GenerationPrompt | null; useGlobalNegativePrompt: boolean }` to a
region. Each ordinary prompt owns authored `text` and exact embedding refs; the
regional shape accepts embedding-kind refs only. The parser introduces no
defaults: absent `prompts` means no blocks and global-negative inheritance.
Both-null wrappers refuse, and a null negative requires inheritance true.
An explicitly empty block remains persisted after Add/Clear; Remove clears that
block, and the final Remove omits the wrapper. Add Negative selects local/empty;
inheritance preserves dormant local text/refs, while Remove Negative clears them
and restores inheritance. Effective inherited text is never copied into the
region. Current Canvas supplies authoring context; future Smart-job freezing is separate.

Strict dedicated prompt IPC accepts authored text or exact ID-only embedding
choices; metadata APIs and ordinary generation-draft target/change validation
are preserved. The shared seal endpoint additionally accepts strict regional
namespaced group IDs, without widening ordinary draft group validation. Main
creates verified refs and checks lock, current owner, revision and epoch through
final publication. Live acknowledged edits participate in grouped
Project Undo, shadow recovery and explicit Save; failed unpublished text remains
local for correction/retry or explicit pending-only discard. Observed external
revision/Undo ABA invalidates the pending stream without rebasing. Existing
1 MiB prompt-text and 16 MiB serialized-document ceilings are defensive format
limits, not measured capacity; regional publication, including Add/Duplicate,
checks the full candidate size before publishing it. No regional PNG, reference
image asset, SQL migration, worker conditioning or accepted provenance is added.
The exclusion of Regional Guidance from every accepted-result provenance group
also applies to future region-conditioned results. Enabled-region NEW ordinary/
Smart refusal and independent published jobs/frozen Retry remain unchanged.
The finite authoring checkpoint is root-qualified. Root confirms 795 Node tests
in 41 files, zero failures/skips, before the final single row ARIA attribute
change. Final row 20c2fb6e has typecheck r7, later row/script scoped lint and fresh
app build r4 PASS; full lint r2 passes all four partitions. Prototype r1 passes
182 shared-consumer browser checks without prototype source changes. Complete
production R4, narrow ARIA R5 and final native-source R7 are CLEAN source-only.
Main inheritance mutation: 2 GREEN → 1 semantic RED / 1 unchanged GREEN control →
2 restored GREEN; all 1,325 source files and the shared subject are restored exactly.

Root's final native-r8/script ff502357 passes all 12 checks in 97.714 seconds,
healthy final code 0 across two Electron lifetimes, including dirty SIGKILL/recovery
and healthy close. Actual Save/loader/reopen and dirty recovery preserve full SQL,
documents, PNGs, masks, variants, provenance, neighbors, operational cursor and
policy. Both observer restorations are true with inFlight zero; all 675/46 original
calls execute once and all handlers are restored. Required `ipc/launch-*.jsonl`
journals retain complete original arguments/results once in portable tagged form;
compact witnesses use prefix references. These are retained qualification evidence,
not new app API or persisted Project data-model fields. Root opens/views all seven
normal/minimum screenshots without material layout findings in scope, as bounded
self-review rather than an independent full accessibility audit. Historical failed
attempts remain failures; native 5's raw running report has an aborted-OOM supplement,
rescued final SQL/product bytes and physical actor closure, without any observer
restoration claim for that attempt.

Retention audits 1–4 are CLEAN and READ-FINISHED. Root completes fresh exit,
restoration and reader checks, removes 18 exact idle payload paths and reclaims
116,359,168 allocated bytes (110.97 MiB), preserving compact evidence and external
dependencies. Contract review R2 is CLEAN at source/document level. No regional masks/reference images,
conditioning, inference, installed embedding/autocomplete, active-work or Main-ABA
qualification is claimed. Final retention/release evidence belongs to the linked
root research; PP-001/007/008 remain **Пока не обещать**.

[Smart Patch foundation](../engineering/phase-4-smart-patch-foundation-research.md)
расширяет pre-release v1 строгой веткой `kind: 'smart-patch'`: common layer fields,
owned `mask: { id, revision: 0, asset: null }`, bbox, internal resolution,
generation draft, пустой `rasterSubLayers` и `activeRasterSubLayerId: null`.
Уникальность layer/mask identities проверяется в одном document namespace.
Mask pixels не подменяются искусственным PNG; empty Patch не добавляет package
assets или preview content. Такой слой проходит Save/reopen и local recovery;
старые Raster-only v1 файлы сохраняют прежний смысл.
[Owned mask authoring](../engineering/phase-4-smart-patch-mask-authoring-research.md)
добавляет следующее pre-release v1 расширение. Null mask допускает любой safe
integer `revision >= 0`, сохраняя прежний `{ id, revision: 0, asset: null }`;
после Clear identity остаётся прежней, revision увеличивается, `bounds` отсутствует.
Painted mask требует `revision > 0`, `asset: { path, sha256, bytes, width, height }`
и `bounds: { x, y, width, height }`. Integer world origin и один pixel на один
Project pixel не зависят от bbox/internal resolution; размеры bounds и asset
совпадают. Bbox edits не двигают и не обрезают mask coverage.
Предыдущий [Transform/Fit implementation](../engineering/phase-4-smart-patch-mask-transform-research.md)
использует тот же формат: Main запекает move/scale/rotation в новый PNG и tight
world bounds, без affine metadata. UI округляет anchor и displayed dimensions
до whole project pixels после отпускания ручки (minimum1px); Main API сохраняет
fractional geometry. Unit integer translation и quarter turns
сохраняют alpha точно; при совпадении output dimensions и alpha сохраняются
исходные проверенные PNG bytes/hash, включая допустимую упаковку импортированного
PNG. Остальные transforms используют 2×2 inverse bilinear sampling с clamped
interpolation внутри source pixel-area rectangle и transparent exterior.
All-zero minification отклоняется, а не очищает mask. Один изменившийся Apply —
один Undo; no-op/cancel не меняют revision/history. На том checkpoint Fit читал
verified pixels, добавлял фиксированные 24px per side (blur16 + padding8),
округлял rect наружу по grid8 и менял только owned bbox, сохраняя mask
identity/revision/bytes и internal resolution. Нынешние owned defaults16/8
дают тот же запас; configurable blur UI добавлен новым settings checkpoint,
а inference blur step остаётся открытым. Qualification: impacted regression1820 PASS
до terminal snapping, final affected59 PASS, built native57 checks и три semantic
RED/neighbor GREEN pairs; typecheck/lint/build PASS. Chronology, source/exit proof
и границы находятся в linked checkpoint. At that checkpoint nonempty variants
and Regional Guidance still refused; their later storage owners are separate.

[Private Main/CPU Smart Patch input capture](../engineering/phase-4-smart-patch-generation-capture-research.md)
не расширяет `.igs` и не сериализует отдельный generation snapshot. Read-only
Main capture удерживает copied document/draft/bbox/internal/settings, verified
whole mask descriptor/bytes и visible source layers только ниже exact target.
Null mask и целая маска вне bbox валидны; этот первый capture возвращает только
original mask metadata/bytes и source RGBA/source alpha. Effective clipping,
four-mode classification и internal-scale conditioning — следующие owners.
Future empty/outside coverage даёт source-only mode. Locked/hidden targets
доступны для private read-only подготовки. По решению15.10.2026 public generation
и Add as Variants запрещены для locked **или** hidden target; admission и
acceptance повторно проверяют оба флага, не меняя их автоматически. Готовый
candidate остаётся временным до явного разрешённого Add либо Discard. После materialization
и входа в callback private leases защищают snapshot при concurrent edit/Undo/Clear/
Save/close. Завершение callback закрывает admission новых composition calls;
cleanup ждёт settlement уже начатых calls, включая sibling после раннего
Promise.all refusal, и не изменяет document,
history, seed, saved package или recovery shadow. Final focused14/affected1852
PASS, четыре actual CPU tests/nine production calls и три isolated semantic
RED/neighbor GREEN probes квалифицируют этот private slice. Typecheck PASS;
lint/build PASS, lifecycle/cleanup подтверждены в checkpoint. Electron/browser/ML proof не заявлен.

Будущий Add в still-existing target после изменения inputs сохраняет frozen
candidate/provenance и вычисляет `outdated` против current inputs; текущие mask,
bbox/internal/blur/draft не подменяют исторический record. Missing target остаётся
orphaned и не ретаргетируется автоматически. BBox padding — Fit-only: сам по себе
не входит в generation staleness, но вызванное Fit изменение bbox входит.
Accepted variants и их persistence не реализуются этим capture checkpoint.

Owned mask members имеют путь `assets/masks/<mask-id>/<sha256>.png`: владелец и
hash в пути должны совпадать с descriptor. Это immutable canonical RGBA8 PNG с
white RGB и linear alpha8 coverage, без color metadata. Alpha `0` означает
отсутствие coverage, `255` — полное покрытие, промежуточные значения сохраняются.
Bounds плотно охватывают nonzero coverage; полностью пустые pixels должны быть
представлены null asset. Package и shadow loaders проверяют CRC/chunks,
декомпрессию, точные размеры/длину, white RGB, nonempty tight coverage и SHA-256,
включая отказ для hash-consistent pixels неправильного формата.
PNG допускает не более 256 IDAT chunks: 257-й отклоняется до накопления очередного
data view, ограничивая overhead объектов независимо от числа decoded pixels.
Текущий Main encoder создаёт один IDAT chunk. Непривязанные mask
members в `.igs` отклоняются. Source capability `igs-mask` привязана к Project,
document revision, layer/mask identity, mask revision и asset hash; renderer не
передаёт файловые пути.

Main создаёт mask pixels по валидной gesture-команде; renderer preview не является
storage authority. Одна завершённая gesture — один Undo step; no-op не меняет
revision/history. Маски включены в общий asset inventory, и текущий документ,
saved baseline, pending Save и retained Undo/Redo states удерживают нужные bytes.
Clear/Save удаляет неиспользуемый mask member из нового `.igs`, но Undo ещё может
восстановить его из session-owned retained assets. Shadow защищает текущий
document и mask bytes локально; `.igs` меняется только через explicit Save.
Маска не становится composite/preview pixels, accepted result или provenance;
UI thumbnail — масштабированный вид того же PNG, без нового worker.

Защитный CPU профиль authoring: 4 000 000 pixels, 4096 по каждой оси, 32 MiB PNG,
256 IDAT chunks, 8192 points и 32 000 000 candidate pixel visits на edit; coordinates ограничены
существующим Project range. Transform scale finite/positive <=10000, rotation
finite [-360,360]. General resampling preflight считает 19×output +2×source visits,
точные integer/quarter paths — 2×source, сохраняя прежний 4M pixel ceiling.
Отказ происходит до document/history publication,
без bbox clipping или downsampling. Это engineering ceilings, не обещание
измеренной capacity. Восемь real Service scenarios, full app regression 3751
PASS/affected 176 PASS и native 33 checks подтвердили PNG/manifest readback,
Save/reopen и actual crash→Recover. Five semantic RED/neighbor GREEN pairs
с exact restoration и bounded typecheck/lint/build прошли; полный suite до
дополнительного IDAT guard, affected run после него. Smart Patch
generation/inpaint, variants/staleness, Regional Guidance и Patch presets остаются
следующими срезами. Для первого Illustrious
`txt2img` Raster Layer уже определена опциональная, строго валидируемая запись
`generationProvenance` прямо в `project.json`; старые v1 файлы без неё читаются.
Это pre-release расширение v1. Main создаёт запись при явном пользовательском
Add из кандидата staging; она сохраняется через Save/reopen. Project и рабочие
raster assets используют sRGB. При импорте worker приводит pixels с исходным
ICC к sRGB, а оригинальные ICC bytes сохраняются в
`assets/profiles/{sha256}.icc` и ссылаются из metadata слоя; одинаковые profiles
могут разделять один member. Для изображения без ICC нет исходного profile
asset. EXIF Orientation исходного изображения применяется к пикселям до
сохранения рабочего raster asset: размеры слоя и preview соответствуют
ориентированному изображению. Композиция и экспорт первого релиза выполняются в sRGB. Import с
некорректным ICC нельзя молча трактовать как корректный sRGB; он получает
явную диагностику. Прототипные artwork fixtures не подтверждают эту конверсию.
Нормализованный worker output содержит закреплённый sRGB ICC (SHA-256
`113f72e7a61626408bf3c95ddbb295aea396a2bbf7c8644b4f373994cc25a3b1`);
main сверяет его bytes и совместимость других PNG color chunks. `.igs` v1
отклоняет встроенный ICC с другим отпечатком и противоречащие PNG color chunks.
RGB-изображение без ICC и без другого цветового сигнала считается sRGB по
правилу для untagged RGB; его фактическое исходное пространство невозможно
доказать только чтением файла. PNG без ICC, но с явными `gAMA`, `cHRM`, `cICP`
или `sRGB`, принимается лишь тогда, когда все эти chunks совместимы с sRGB;
иначе import останавливается с диагностикой вместо скрытой подмены цветов.
Untagged CMYK worker не импортирует. Исходный профиль хранится отдельно от
рабочего asset.

Пределы первой реализации — защитные engineering ceilings, а не измеренная
ёмкость продукта: 10 000 ZIP entries, 32 GiB суммарных распакованных данных,
8 GiB на member, 4 MiB на ICC profile, 4 MiB на manifest JSON,
16 MiB на project JSON и 32 768 px
на сторону raster asset. Реальные проекты и Linux/NVIDIA worker должны пройти
capacity tests до релиза; лимит генерации не выводится из этих потолков и не
копируется из mock UI.

Модели, LoRA, VAE и другие большие reusable resources не встраиваются в `.igs` по умолчанию. Project file хранит ссылки и compatibility metadata: local resource id, file hash, CivitAI ids, base model family, nullable Illustrious `predictionType`, display name/version и отсутствующий-resource status после проверки. Поле `predictionType` — справочный snapshot момента выбора или старого сохранения, а не настройка Project: даже сохранённое non-null значение не определяет будущий inference. Единственный редактируемый Illustrious type находится в Model Manager по точным SHA-256 и размеру. Prepare повторно хеширует файл, берёт текущий effective type (при отсутствии известного значения — помеченное `epsilon`) и не переписывает `.igs` независимо от сохранённого non-null или `null`; frozen job и accepted provenance фиксируют фактически использованный тип. Изменение override после Prepare и до materialization прерывает старую подготовку.

Model Manager хранит пользовательский Illustrious override отдельно от
неизменяемой CivitAI source metadata и явно известного значения; override
привязан к точным SHA-256 и размеру файла. Effective type имеет основание:
override, известное значение или default-предположение.
`predictionType` в `.igs` — advisory snapshot; Project показывает read-only
текущий тип из библиотеки, а не сохранённый snapshot. Для Prepare authoritative
только текущий effective type точного проверенного файла. Для Anima вместо SDXL типа будущие
frozen jobs/provenance фиксируют точные component references и результат
структурной проверки; нынешняя `.igs` v1 их ещё не сериализует.

`preview/thumbnail.webp` и `preview/merged.png` внутри `.igs` являются переносимыми preview-артефактами проекта. Они едут вместе с project file и являются источником истины для project preview.
На бесконечном Project Canvas их конечный rasterization rect определяется по
union bounds видимого composited raster content: видимые Raster Layers и
активные видимые Smart Patch variants. Скрытое содержимое и primary generation
bbox не расширяют этот rect. `manifest.preview.rect` хранит эти координаты в
пространстве Canvas; размеры PNG/WebP могут быть меньше из-за downsampling.
Защитный лимит 32 768 px относится к закодированному изображению и отдельному
layer asset, а не к ширине/высоте world-space rect. Для проекта без видимых raster pixels оба preview
артефакта содержат детерминированный placeholder для Home, не «размер canvas»
и не изображение, доступное для `Export As`; `preview.status=empty` сохраняется
даже без worker. Default image export использует тот же visible-content bounds
rule и в пустом проекте недоступен.

Save не блокируется отсутствующим или упавшим ML Worker. Когда worker не может
построить актуальный raster preview для проекта **с видимыми пикселями**, main
кладёт в **оба** обязательных preview-файла статический, поставляемый с
приложением placeholder и отмечает в `manifest.json`
`preview.status=unavailable`; содержимое слоёв и assets сохраняется полностью.
В этом случае manifest по-прежнему сохраняет world-space rect видимого
содержимого, даже если он больше разрешённого размера PNG и сами preview-файлы
содержат статическую заглушку.
При недоступном worker и compositor main использует консервативные bounds
видимых Raster Layers: прозрачность отдельных пикселей и взаимное перекрытие
неизвестны. Поэтому видимый, но полностью прозрачный слой может получить
`unavailable`; `empty` без worker означает, что нет ни одного потенциально
видимого raster layer. После восстановления worker актуальный preview
пересчитывается по действительно видимому composited content.
Состояния `rendered`, `empty` и `unavailable` различаются в этом поле, чтобы placeholder
при отказе worker не выдавался за пустой проект или актуальный composite.
Нельзя повторно использовать старый preview от предыдущей ревизии как новый.
Следующий явный Save с доступным worker пересоздаёт previews и меняет состояние
на `rendered`. Для чистого Project то же делает явное `Rebuild Preview` из
Home: main атомарно пересобирает `.igs`, меняя только preview/manifest и cache,
не меняя document revision, dirty/undo, accepted results или staging.
Команда сериализуется с Save и непосредственно перед заменой повторно
проверяет project identity и dirty state; на dirty Project она открывает
Project для Save, чтобы не записать preview от старой ревизии вместо текущих
изменений. Document revision/hash нельзя вычислять из всего ZIP package,
preview bytes или mtime: maintenance rebuild меняет package fingerprint, но
не документные данные. Ошибка worker/rebuild оставляет старый пакет с placeholder
читаемым. Main не создаёт производное изображение и не запускает отдельный
preview worker ради этой ветки.

`ImageGen Studio/previews/project-thumbnails/` используется только как derived cache для быстрого отображения Home. Этот кэш можно удалить и пересобрать из `.igs`. Если cache preview отсутствует или устарел, приложение читает `preview/thumbnail.webp` из `.igs` и обновляет cache entry.

Storage serves [PP-007](../product-promises.md#pp-007-проект-принадлежит-пользователю):
the portable saved project remains authoritative independently of derived indexes.
The acceptance boundary is defined by
[PP-008](../product-promises.md#pp-008-генерация-меняет-проект-только-по-явному-решению)
and the [staging contract](../features/project/generate-mode/generation-results.md).

### Smart Patch mask settings

The [owned settings checkpoint](../engineering/phase-4-smart-patch-mask-settings-research.md)
adds optional layer-level `maskSettings: { blur, padding }` to the strict Smart
Patch schema, separate from the immutable mask asset. Both are integer project
pixels0..512. New Patch stores16/8; legacy absence means effective16/8 while
parse/open retain absence, member hashes and clean state. Default no-op edits do
not materialize the optional field. New readers accept both forms; compatibility
of new files with older strict readers is not claimed. Raster rejects this field.

Scalar Main changes capture documentId/documentRevision and targeted layerId;
malformed/stale/locked/missing/Raster targets refuse. One changed scalar is one
Undo. PNG/hash/mask revision/bounds and bbox/internal/draft/other owners remain
unchanged. Fit reads current owned settings and applies blur+padding outward8-grid
only on invocation. Save/shadow serialize actual optional values with existing
package and retention owners; no new worker or persistence backend is introduced.
Private coherence/fade preparation now freezes and uses the same blur without
baking it into authored mask pixels;future inference/compositing must retain
that input ownership. Padding affects Fit only. The checkpoint
is qualified:impacted1835/final104/native109 PASS,three isolated semantic
RED/GREEN pairs and required typecheck/lint/build PASS. Its scope/chronology are
recorded in the linked research;public readiness remains unchanged.

### Smart Patch owned coherence settings

The qualified [owned coherence scope](../engineering/phase-4-smart-patch-coherence-settings-research.md)
adds optional top-level `coherenceSettings:{mode,edgeSize,minimumDenoise}` to the
strict Smart Patch schema. Modes are Gaussian Blur/Box Blur/Staged;edge is integer
0..1024 PROCESSING pixels,minimum denoise finite0..1. Resolved defaults are
Gaussian Blur/16/0. Parse/open/Save retain legacy absence;read/default no-op do
not inject fields,dirty the document or change member hashes. Affected1927 TS,
prototype180,native14 including actual process death→Home Recover,and three
semantic RED/GREEN pairs PASS;typecheck/lint/build PASS. Old strict readers
accepting new fields is not claimed.

Captured whole-profile Main edits validate documentId/documentRevision and exact
target;invalid/stale/locked/missing/foreign/Raster owners refuse. One changed
profile uses existing Undo/Redo,Save/loader and local shadow/recovery;original mask
assets/revision/bounds,blur/padding,bbox/internal/draft and other layers remain
unchanged. Private capture resolves and freezes owned profile before await and
uses it for default CPU conditioning;explicit private override is not a document
write. No accepted variant/provenance/preset/Compare field or schema version is
introduced by this slice. Relevant future coherence metadata belongs to immutable
layer/source context for staleness,not reusable generation configuration.

### Current Smart Patch durable acceptance

[Smart Patch durable acceptance](../engineering/phase-4-smart-patch-durable-acceptance-research.md)
Private Main Add now appends verified world candidates to the exact Smart Patch,
preserving old variants and current authoring with one active anchor and one Undo.
A shared Project gate and SQL intent slot serialize Raster/Smart acceptance and
close. Dedicated Smart cancellation drains inference, claim startup, CPU work
and publication; late completions require renewed review. Captured sessions are
checked against foreign targets, documents and ordinary results.

The durable order is intent → asset adoption → synced shadow → atomic session
tombstones/intent removal → staging cleanup. Recovery dispatch selects one owner;
full immutable lineage completes, absence abandons without consuming candidates,
partial/changed lineage or unknown overlap stays fenced. A clean saved package
must pass actual member verification plus file/directory sync before replacing
shadow proof. Replays do not duplicate or reactivate variants. Add never performs
Save or rewrites completed receipts/seed cursor.

Public Smart Generate/Results/IPC, variant lifecycle controls, freshness/resource
UI, accepted-history navigation, Compare/Preset and installed inference
qualification remain later owners. PP-007/008 remain «Пока не обещать». Next finite
owner is variant lifecycle and current-state diagnostics before public integration.
Executed evidence and finite limits belong to the linked research.

### Previous Smart Patch variant storage and active material

[Variant storage and material composition](../engineering/phase-4-smart-patch-variant-storage-research.md)
The document now owns nonempty Smart Patches: all active and inactive variant
images survive explicit Save, local recovery and Undo/Redo retention. Actual PNG
bytes, canonical sRGB profile, dimensions and immutable contribution alpha are
verified before package or new shadow publication. A metadata-only alpha change
cannot reuse a prior pixel proof. Current layer/mask/variant IDs are unique;
frozen source IDs remain historical when a later copy has new ownership.

Only the active image contributes pixels, at its own frozen world bbox and its
parent's stack position, visibility, opacity and blend mode. Current Patch bbox,
mask, blur and internal-resolution edits do not move, resize or remask stored
RGBA. Main source capture, preview/bounds and the signed renderer image resource
use this projection. The DTO/card reports `stored`, without claiming freshness
or current model availability. Top-level Raster mutation/history selectors stay
separate from this material projection.

This is storage/display support for an already populated document, not the
public acceptance command. Generate/Add, durable acceptance journal and sibling
cancellation/reconciliation, variant lifecycle controls, accepted-history
navigation, Smart Patch Compare/Preset and installed inference qualification
remain later owners. PP-007/008 remain «Пока не обещать». Executed evidence and
remaining limits belong to the linked research.

### Previous Smart Patch private acceptance-plan material

[Smart Patch acceptance plan](../engineering/phase-4-smart-patch-acceptance-plan-research.md)
adds strict standalone variant/provenance contracts and a read-only proposal;
the Project schema still accepts only empty Smart Patches. Identity-bound staging
reads verify actual world RGBA and final-mask bytes. The projector checks frozen
context, worker-confirmed seed, exact contribution alpha and inference prediction
type before proposing portable metadata without managed paths or reusable `Size`.
Owned authoring and independently composed current source pixels determine
ready/outdated; unrelated Project revisions and Fit-only padding do not.
This comparison does not qualify current model-registry or runtime availability.

Private `ProjectService.prepareSmartPatchVariantAcceptance` rechecks the exact
Project owner, document/revision, target and reviewed selection around byte reads
and current-source composition. Locked or hidden targets block the proposal;
missing targets remain orphaned. A changed eligible target keeps frozen proposal
metadata and reports outdated inputs. The returned plan is not an accepted result
or a capability to commit later without revalidation.

No Project/history/`.igs` mutation, sibling cancellation, acceptance journal,
staging discard or public UI is connected. Next owners are all-variant asset
storage/validation and active-variant composition, then durable Add/reconciliation,
variant lifecycle and public Generate/Results integration. PP-007/008 remain
«Пока не обещать»; executed evidence and limits belong to the linked research.

### Previous Smart Patch private queued execution material

[Private queued Smart Patch execution](../engineering/phase-4-smart-patch-queued-execution-research.md)
connects dedicated SQL claim, exact frozen inference, worker-confirmed uint32 seed,
CPU world composition and independently durable Smart Patch world candidates.
The private `GenerationOrchestrator.createSmartPatchExecution` handle waits for
admission and exposes explicit run/cancel/stop ownership; public drain stays off.
Both family operations share the global running-slot CAS with ordinary jobs;
normal dispatch/readers and Raster acceptance remain separate. One cancellation
owner drains inference, CPU startup/request/readback and publication before
acknowledging cancel or cleaning scratch; unconfirmed exit retains its owner,
slot and files. The private inference capability now also requires
`smart-patch-seed-confirmation`; older installed payloads refuse before ML.

A separate typed store at `recovery/smart-patch-staging` reserves the shared
receipt before fsynced world RGBA/final-mask/manifest publication, then commits
queue+receipt+actual-seed cursor atomically. Exact reload and APP_RESTART recovery
keep independent final alpha and context after terminal queue/input pruning;
USER_CANCELED cannot resurrect a candidate. Shared tombstones hide discarded
sessions across both stores. Normal Results never discovers these candidates,
and the Smart DTO cannot be assigned to the normal Raster DTO.

That checkpoint established a private executable/recoverable path. Public
Generate/Retry/Results, immutable variant acceptance/outdated/orphan handling,
portable provenance and installed GPU/release qualification were subsequent
owners. It introduced no Project/document/`.igs`/history/preset/Compare edits. PP-007/008 public readiness
remains «Пока не обещать»; actual checks and limits belong to the linked research.

### Previous Smart Patch private SQL queue material

[Private Smart Patch queue admission](../engineering/phase-4-smart-patch-queue-admission-research.md)
adds real `illustrious-smart-patch` / `anima-smart-patch` pending rows to the common
SQL queue. One independent queue-owned bundle under
`generation-queued-inputs/smart-patch/<UUID>` serves1..32 concrete items;
caller-owned prepared bundles remain independent. Strict DTO and actual-byte
reload bind Project/document/layer, world/internal geometry, exact manifest and
item index. Resource/prediction/noise policy and current unlocked+visible target
are rechecked before atomic SQL insertion. Exact lost-ack readback confirms the
whole batch; unknown outcomes retain files and fence the Project. Cancel and
restart cancel unfinished jobs without replay; terminal pruning reclaims only
an exact verified bundle after its last SQL reference. Unknown/corrupt/incomplete
bundles are retained. Queue metadata understands both families; normal dispatch,
ordinary Retry and normal input readers refuse these jobs before runtime use.
This is private durable admission, not runnable public generation. No candidate,
receipt, actual-seed cursor, variant, Project/`.igs`/provenance/preset/Compare or
public Smart Patch Generate/acceptance UI is introduced; Retry remains explicitly
disabled. At that admission checkpoint the next owners were dedicated typed
dispatch, worker-confirmed actualSeed, owned inference+CPU cancellation and
durable world candidates, now covered above; immutable acceptance remains next. Public PP-007/008 remain
«Пока не обещать». Verification evidence and limits are in the linked research.

### Previous Smart Patch private execution material

[Private durable Smart Patch inputs](../engineering/phase-4-smart-patch-durable-input-research.md)
adds a separate local `generation-prepared-inputs/smart-patch/<UUID>` owner before
SQL admission. It stores one frozen target context,1..32 concrete family items
and fixed source/authored-mask/model-source/latent-KEEP/final-contribution PNG
roles. Transient execution paths/request IDs are excluded. Color/numeric topology,
metadata and actual bytes are strictly checked on reload; source world dimensions
and processing dimensions remain independent. Files are fsynced before an
exclusive manifest commit marker, followed by directory/parent fsync. Uncertain
postpublication durability retains the bundle and its identity. Explicit discard
requires the exact verified owner; no broad startup sweep is added. This root is
separate from `generation-inputs`, whose ordinary queue cleanup cannot own it.
No SQL row/migration, worker execution, candidate/receipt/recovery session, seed
cursor, document/shadow/history/`.igs` or accepted provenance change is added.
Input persistence is not automatic job replay. Complete queue/staging ownership
and immutable acceptance remain next; evidence/limits belong to the linked note.

[Private world output](../engineering/phase-4-smart-patch-world-output-research.md)
adds a transient world-bbox-size RGBA PNG and detached `worldContribution` to
`capture.executeAndCompose`. Generated RGB is resized with BICUBIC; the frozen
final world GENERATE alpha is attached unchanged, without repeated fade or source
pasteback. Main independently verifies actual pixels/profile/hash/dimensions and
byte-exact alpha equality against that frozen mask. Placement remains the frozen
`context.bbox`, without adding world coordinates to the CPU request.

One drained operation lease covers preparation, exact resources, native inference,
CPU composition and final consumption; unconfirmed worker exit retains the full
stage even after callback failure. The CPU derivatives-only worker 0.1.0 requires
`smart-patch-output-composition`; old payloads refuse before dispatch. The owned
operation directory is `0700` beneath the existing scratch base, which may be `0775`.
`capture.execute` retains its detached processing RGB contract. No SQL rows,
migration, durable job/candidate/receipt/recovery manifest, seed-cursor update,
document/history/shadow/`.igs` mutation, variant or provenance/preset/Compare
field is added. Durable queue/batch and immutable acceptance remain subsequent
owners. Evidence and qualification limits belong to the linked research.

The previous [Main/worker execution bridge](../engineering/phase-4-smart-patch-execution-bridge-research.md)
adds a transient processing-size RGB PNG and returns detached verified bytes to
one `capture.execute` caller. The exact concrete prompt pair and uint32 seed are
already planned inputs; this boundary neither expands dynamic prompts nor reads
or advances the durable actual-seed cursor. Existing resource storage remains
authoritative: Main resolves exact files and Python verifies them around loading.
Worker0.14.0 must advertise the private `smart-patch-execution` capability;
source changes do not upgrade installed runtime payloads.

The same operation lease covers original inputs, preparation, resources, worker
execution and final Main RGB/ICC/hash/geometry verification. Cleanup follows all
admitted work and consumption. On worker process failure/timeout it also waits for
physical exit; `WORKER_EXIT_UNCONFIRMED` retains the capture staging even after
callback failure. Retention is a safety hold, not a candidate/recovery manifest
or automatic replay contract.

This slice adds no SQL rows/migration, durable jobs/candidates/receipts, seed
cursor changes, document/history/shadow mutations, accepted variant, `.igs`
member/schema or public readiness. World composition was separate at that
checkpoint and is added above; immutable acceptance remains open. Executed
evidence and qualification limits are in the linked
research.

### Previous Smart Patch private numerical denoising material

[Private family VAE/denoising](../engineering/phase-4-smart-patch-denoising-research.md)
consumes detached prepared RGB and numeric latent KEEP with caller-owned loaded
models. Returned RGB/Anima latents are transient numerical results, not durable
staging candidates or accepted assets. This adapter adds no filesystem publisher,
worker command, Main transport, queue/receipt, `.igs` member/schema, document edit,
history, recovery or immutable provenance. It does not save automatically.

The all255 KEEP case still executes VAE and denoising with fully protected latents,
retains the frozen INP/OUT world mode and returns the VAE reconstruction; it does
not fabricate latent coverage or promise generated detail in a lost tiny edit.
Focused72 Python PASS covers65 real tiny native family cases and seven actual CPU
protocol preparation-to-adapter cases. Six solvers/family and Illustrious EPS/V
are numerical CPU evidence, not trained/installed/GPU or public persistence proof.
At that numerical checkpoint the worker/Main execution bridge/resource admission
was pending; the later bridge above adds it, and the later world-output checkpoint
adds private composition. Immutable variant lifecycle remains a future owner;
public statuses stay unchanged.

### Previous Smart Patch private model-source material

[Private model-source preparation](../engineering/phase-4-smart-patch-model-source-research.md)
adds no `.igs` member/schema or persisted Project state. Its RGB PNG or TXT null
and six independent conditioning planes are leased operation material,not an
accepted image,document asset or automatic Save. Main freezes ownership/context,
resolves pinned LaMa only for OUT,and the worker returns full source-alpha-only
LaMa RGB or exact IMG/INP RGB. Resize-derived uniform alpha does not change the
frozen world mode. Existing normal OUT admission is preserved.

Affected1937 TS/527 Python (focused65/68),two actual Main trained-source cases with unchanged
storage/original source,four exact trained wholeRGB Invoke comparisons and three
semantic RED/GREEN pairs qualify this finite boundary. Global lint/typecheck/build
and worker Ruff/basedpyright PASS;limits are recorded in the linked research.
Saved packages,shadow/history/seed and
queue/receipts remain unchanged;no durable jobs,variants,provenance,preset/Compare
fields or public Smart Patch Generate readiness follow from temporary RGB preparation.

### Generation draft dynamic settings

The v1 `project.json` schema accepts an optional strict
`generationDraft.dynamicPrompt` object with `maxPrompts` (safe integer 1..100)
and `seedBehavior` (`per-iteration` or `per-prompt`). New documents store
explicit owned defaults: 100 and `per-iteration`. A legacy absent object stays
absent on read/open and uses those defaults only for UI/planning. An
effective-default no-op does not synthesize a field, revision or dirty/Undo step.
Unknown keys and invalid values fail the package/IPC boundary before mutation.

Actual settings edits use the ordinary document history, recovery shadow and
explicit Save path. Renderer synchronization captures the full nested settings
value before queued awaits; Save/tab close/window close flush that path.
The preview list, parse errors, modal visibility and images-per-click are not
added to portable storage by this checkpoint. The one-iteration preview applies
the independent 32-job policy; `maxPrompts=100` is a prefix setting, not admission
for 100 jobs. Editing the draft never changes frozen jobs or accepted provenance.
See [production preview evidence](../engineering/phase-2b-dynamic-preview-research.md).

### Generation draft Anima sampling

The authored v1 `generationDraft.sampling` accepts optional finite
`animaMethod`: `euler`, `heun`, `dpmpp_2m`, `dpmpp_2m_sde`, `er_sde` or `lcm`.
Absence means unset; loading legacy documents does not create Euler. The clear
command deletes the member. Family switching retains both this choice and the
inactive Illustrious sampler/scheduler pair. Ordinary Undo/shadow/explicit
Save/reopen own the edit. This additive draft field does not expand frozen
accepted Raster configuration, queue payloads or worker admission. See the
[authoring checkpoint](../engineering/phase-2c-anima-authoring-research.md).

The separate [Main preparation checkpoint](../engineering/phase-2c-anima-main-preparation-research.md)
copies draft/resource identities, document ID/revision, actual target bytes and
resolved seed into ephemeral Anima contexts and concrete compiled requests.
Reuse reads the operational cursor for the captured local Project/document,
then the saved snapshot; Fixed/Random do not read that cursor. Preparation does
not advance it, save the document, publish queue rows or create candidates.
These internal contexts are not new `.igs` accepted configuration or a durable
Anima queue format.

The [durable Anima checkpoint](../engineering/phase-2c-anima-durable-jobs-research.md)
adds a separate strict per-item operational v1 union for `anima-txt2img` and
`anima-img2img`. Migration 0014 preserves existing attempts, indexes and independent
receipts. Each item stores concrete raw/compiled signs, its native plan, exact
checkpoint/Qwen3/VAE and ordered effective/configured LoRAs; disposable paths and
full batch templates are excluded. Existing payload/target/session ceilings apply
to actual serialized and JSON-escaped bytes. Recovery retains candidates and
updates the local Project/document seed cursor only for verified completion.
That durable checkpoint did not change the worker protocol or accepted schema.
The subsequent [public Anima integration](../engineering/phase-2c-anima-public-generation-research.md)
adds strict portable v1 `anima-txt2img` / `anima-img2img` records after explicit
Add. They store exact original bundle identities/sizes, concrete weighted signs,
native sampling, actual seed, full configured LoRAs and explicit neutral policies;
private paths, compiled arrays and regional data are excluded. Existing
Illustrious shapes and package ceilings are unchanged. Add validates the actual
prospective package before cancellation/journal/mutation. Undo/Redo, shadow
Recover, Save/readback, portable copy/open and derived saved-result indexes
preserve the same baseline. Temporary candidates still remain local outside
`.igs`; old binaries cannot interpret newly authored native record kinds.

### Generation provenance

Generation provenance — immutable metadata of an accepted Raster Layer or Smart Patch variant: recorded settings, resources, non-regional source context and runtime parameters associated with that persistent result. It is not a complete reconstruction recipe when Regional Guidance was used.

Provenance exists only after explicit `Add N as Layers` / `Add N as Variants`. Worker completion and a temporary staging candidate do not create a project-local provenance record.

Acceptance attaches project-local provenance to the open document and its
recovery shadow; explicit Save stores it inside `.igs`, referenced by its
accepted layer/variant. Its payload logically distinguishes portable
`generationConfiguration`, diagnostic `layerSourceContext` and
`executionResultContext`. The eventual physical schema may encode these as
explicit nested groups, but must preserve the ownership boundary.

The first production storage slice uses these three nested groups as an optional
inline `generationProvenance` value on a Raster Layer in v1 `project.json`. It
supports only a verified Illustrious `txt2img` candidate, with strict
version/kind, exact model and actual prediction type, source and output hashes,
frozen bbox, actual seed and canonical completion/acceptance timestamps. The
owning `layer.id` is the accepted-result identity; `candidateId` records its
staging origin. Imported/manual Raster Layers have no provenance. Package Save,
reopen and dirty shadow recovery preserve this value, but no production Add
action was connected at that first storage checkpoint. The subsequent
[explicit Add Raster](../engineering/phase-2b-raster-acceptance-research.md)
attaches it through renderer → IPC → shadow → Save. New
[prepared batches](../engineering/phase-2b-batch-planning-research.md) retain
optional `sampling.seedBehavior` in frozen metadata and accepted provenance;
legacy absence remains unspecified. Smart Patch/other modes remain open;
the saved-result SQLite projection below covers generated Raster Layers. See the
[storage checkpoint](../engineering/phase-2b-accepted-provenance-storage.md).

`generationConfiguration` contains:

- prompt / negative prompt;
- actual seed, requested Seed policy and dynamic seed behavior;
- sampler, scheduler, steps, CFG and applicable reusable primary generation
  bbox width/height, never Smart Patch geometry or internal resolution;
- model, LoRA, VAE references and compatibility metadata;
- фактический `predictionType`;
- automatically derived txt2img/img2img/inpaint/outpaint mode;
- CFG Rescale, VAE Precision and other supported, reproducible
  generation/conditioning options.

Regional Guidance is excluded from every accepted-result provenance group,
including `generationConfiguration` and `layerSourceContext`. Frozen operational
worker input may contain Regional Guidance needed to run the job, but acceptance
does not copy it into provenance. A saved result generated with regions therefore
cannot fully reconstruct that regional setup.

`layerSourceContext` contains, where relevant:

- input image/source composite identity;
- Smart Patch mask, bounding box and internal resolution;
- compositing state;
- source composite/mask/layer revision hashes.

`executionResultContext` contains:

- stable accepted-result identity in the open document and, after Save, `.igs`;
- created_at и worker/runtime metadata, нужные для воспроизводимости.

The latter two groups are retained for diagnostics, explainability and Smart
Patch `outdated`; they are not a preset payload and are not presented as
generation settings.

Immediately after Add, each accepted result appears in the open Project's
history UI projection; the projection is rebuilt from the recovered document
shadow after a crash. SQLite may store a derived durable global history index
for saved accepted results: project path, result/provenance id, created_at,
thumbnail/cache key and searchable metadata. Explicit Save synchronizes that
index with the accepted layer/variant and project-local provenance in `.igs`,
which remain its source of truth.

`Compare generation settings` is derived at runtime and is not serialized as a
second snapshot or cached diff. A generated Raster Layer contributes its
provenance; a Smart Patch Layer contributes active-variant provenance. The other
side is always a current projection of portable generation configuration in the
open `ProjectDocumentModel`. Layer/source context is excluded from this settings
diff. The comparison never uses a second variant's provenance as `Current
Canvas`.

One multi-accept may create several history rows but one grouped Project undo step. Discarded candidates never enter global history.

Accepted-result history has no soft-delete/tombstone lifecycle. Its global
SQLite rows are derived from accepted results in `.igs`; removing or rebuilding
an index row cannot silently delete or hide the source result. Queue Manager's
independent terminal-job pruning is not accepted-result history deletion.

[Production Project-local history](../engineering/phase-2b-project-accepted-results-research.md)
now projects current generated Raster Layer provenance into the open tab and
rebuilds the read-only list after Undo/Redo, shadow Recover and `.igs` reopen.
The history identity is the owning layer ID. Original output dimensions/seed
remain recorded generation values even when the current asset dimensions differ.
This Project-local projection introduces no new stored catalog.

[Production saved-result index](../engineering/phase-2b-saved-accepted-index-research.md)
now derives metadata in `project_accepted_result_index` from verified saved
generated Raster Layers. Create, Import, explicit Save, preview rebuild and
workspace Refresh use the same `ProjectIndexRepository.indexSaved` owner. Within
one SQLite transaction it replaces Home metadata and that path's result rows.
The key is `(local_project_key, layer_id)`; portable copies may share document,
candidate and layer IDs without collapsing across local paths. Records retain
the source document revision, frozen actual seed/checkpoint/acceptedAt/original
output size, and separate current layer name/asset path/hash/bytes/dimensions.
No signed URLs, pixels or duplicate full provenance are stored.

An internal Project-scoped query includes only ready, non-trashed parents with
matching document lineage and a verified file fingerprint. Missing/corrupt/
unsupported sources retain recoverable metadata but are excluded from that query;
repaired files and an empty/lost index are rebuilt by scanning saved sources.
Unsaved Add, editing, Undo/Redo and shadow Recover do not update these durable rows.
`.igs` commits before index synchronization: if indexing fails, Save reports its
existing committed-file warning, the whole previous DB snapshot remains intact,
and Refresh repairs the projection. Index rebuilding never deletes source files.
The [app-level saved-result browser](../engineering/phase-2b-accepted-history-browser-research.md)
adds strict bounded read-only IPC and keyset pages of 50 with count/page in the
same SQLite snapshot. Metadata pages do not read pixels or depend on a worker.
Public DTOs contain copied summary values and exact Project/document/layer/asset
identity; filesystem paths, fingerprints and full provenance stay in Main.
Closed saved-layer previews use a process-lifetime signed `igs-history` resource,
verified against the current index, canonical workspace and saved package.
It cannot substitute dirty, staged or merged Project pixels. Preview budget is
32 MiB and at most 2048 per side for the current asset, independently of original
output dimensions; unavailable/oversized previews retain valid navigation.
The first browser makes no derivatives in Main. Smart Patch indexing, filters and
worker-produced per-result thumbnail/cache optimization remain pending.

### Temporary generation staging

Queue completion writes candidate assets to application-managed recovery storage,
separate from both the document autosave shadow and the user-owned `.igs`:

```text
ImageGen Studio/recovery/generation-staging/{local-project-key}/{session-id}/
├─ manifest.json
└─ assets/
   └─ {candidate-id}.png
```

Rules:

- candidates are previewed by `GenerationResults` without becoming layers or
  marking the Project dirty;
- the manifest records stable project/session/candidate/target identities,
  committed asset path and integrity metadata, frozen job inputs/resources and
  actual result metadata needed to create provenance on later acceptance. For
  Smart Patch candidates it also retains the frozen bbox and either a
  display-ready raster with transparency or immutable mask/compositing
  snapshot assets needed for faithful independent Raster Layer conversion if
  the target layer is missing after recovery;
  queue-row retention is never the only copy of that context;
- main process writes each output to a provisional file, validates it, then
  atomically publishes the asset and manifest update. Only a validated,
  manifest-backed candidate can be shown as completed/recoverable;
- each committed candidate records its actual seed and stable completion order.
  After manifest publication, a durable SQLite completion transaction marks
  its queue item completed and advances the Project seed cursor. If a crash
  occurs between those operations, startup reconciles valid committed
  manifests idempotently by candidate id and completion order before `Reuse`
  becomes available. A missing, corrupt or partial output never advances the
  cursor;
- a crash between filesystem and SQLite updates is reconciled idempotently by
  candidate id: valid committed manifest entries remain recoverable even if a
  queue row was not marked completed or has since been pruned; unreferenced partial
  files and manifest entries with missing/corrupt assets are not shown as
  usable candidates and are diagnosed/quarantined for cleanup;
- focus and checkbox selection are ephemeral staging UI state and may be
  initialized again when valid candidates are recovered;
- a valid Smart Patch candidate whose target layer is absent after recovery is
  retained and surfaced as orphaned, not treated as a corrupt/partial file.
  Original Add as Variant is disabled. The user may explicitly Add as Raster
  Layer at the frozen bbox only when its committed asset and retained geometry/
  compositing snapshot reproduce the candidate's own visible contribution
  without the missing layer. Otherwise Raster conversion is disabled. A valid
  asset still supports explicit Save Candidate Image export, and Discard remains
  available; export neither accepts it into the Project nor removes its
  recovery entry. None of these actions silently retargets or changes an
  existing layer;
- `Add N as Layers/Variants` first gives selected raster assets and frozen
  context to the open document and document recovery shadow, creating accepted
  provenance there. Only after that handoff is durable may their staging
  records/assets be removed. The main `.igs` receives accepted state on
  explicit Save; failed handoff leaves the candidate recoverable;
- before Raster Add mutates the document, a durable SQLite journal captures
  operation/local Project/document identity, expected layer assets/provenance
  and exact staging sessions. Intent without proven durable adoption cannot
  delete candidates. After proof, one transaction records captured-session
  tombstones and removes the intent; restart finishes file cleanup. Newer
  sessions and another document at the same local path are preserved. Older
  no-journal handoffs clean only independently proven accepted sessions;
- Save of an otherwise dirty Project clears only its document shadow, never
  unaccepted staging recovery. A clean saved Project with valid completed
  candidates can therefore offer recovery after a crash;
- discarding a completed candidate or its staging session does not roll back
  the last actual seed: the output really completed. The cursor has its own
  retention lifecycle and is not derived from remaining candidate files;
- graceful confirmed Project close cancels its unfinished jobs, durably marks
  its staging session discarded before close commits, then cleans its
  candidates; late outputs for that session cannot be published. Explicit
  per-candidate/session discard follows
  the same cleanup rule without creating provenance/history;
- cleanup removes discarded, accepted-after-handoff, unreferenced filesystem
  orphans and invalid candidate data; a valid missing-target Smart Patch
  candidate is retained until explicit Add as Raster Layer or Discard. A quota
  must be checked before reserving new output space;
  when space is insufficient, enqueue/completion reports an actionable error
  instead of silently evicting valid unresolved recovery. A failed deletion
  remains hidden/tombstoned and is retried by GC;
- Queue Manager rows may outlive candidate cleanup but never become accepted-result history.

### Upscale assets follow-up

Upscale is deferred from the current Project pass. Its previously agreed storage direction remains an immutable flattened composite input rather than a live layer-stack reference.

При команде `Send Composite to Upscale` или `Use Current Composite` приложение создаёт внутри `.igs` отдельный upscale input asset:

```text
assets/upscale-inputs/{id}.png
```

Metadata input'а хранит:

- source layer stack hash;
- finite source capture bounds in Project coordinates;
- source project revision id или timestamp;
- visible layers metadata;
- created_at;
- исходный project mode/action, который создал input.

Если после создания input'а слой, маска, opacity, blend mode или выбранные
границы захвата изменились, input считается устаревшим относительно исходного
composite. Upscale mode должен показывать `Source is outdated` и предлагать refresh.

Upscale result хранится как отдельный asset:

```text
assets/upscale-results/{id}.png
```

In the future result can be:

- добавить в Project как новый raster layer;
- экспортировать наружу.

Destructive replace source/composite не входит в MVP.

### Project identity

Для runtime tab management каждый открытый `.igs` должен иметь стабильную identity.

MVP-правило:

- canonical project identity строится из нормализованного абсолютного пути к `.igs`;
- приложение держит in-memory registry открытых project identities;
- при попытке открыть `.igs`, identity которого уже есть в registry, приложение фокусирует существующую `Project` tab;
- создание второй вкладки для того же `.igs` запрещено для всех entry points: `Home`, file picker, menu action, drag/drop, deep link.
- приложение запускается в single-instance режиме через Electron main process, чтобы второй OS-инстанс не мог открыть тот же `.igs` параллельно с первым.

Portable `documentId` inside `.igs` identifies document content, but cannot be
the sole key for local autosave, staging or the last-seed cursor: copying a file
copies that id too. App-managed recovery uses a key derived from the canonical
local project identity/path. Seed-cursor reads additionally match the open
document's `documentId`; neither identifier alone is sufficient. A managed move
migrates the local key with its recovery and cursor records; an independently
imported copy receives a distinct local key even if the portable `documentId`
matches.

Если позже понадобится поддержка symlink-heavy workflow или network paths, identity policy можно расширить через filesystem inode/file id там, где платформа это поддерживает. Для MVP достаточно canonical path + rescan/relink поведения.

### Валидация `.igs`

При открытии `.igs` приложение должно:

- проверить, что файл является корректным project package ImageGen Studio;
- проверить `schemaVersion`;
- валидировать `manifest.json` и `project.json` через runtime schema;
- запретить опасные archive paths вроде `../` и абсолютных путей;
- проверить наличие обязательных assets, referenced layers, masks и previews;
- проверить допустимость preview state и формат обязательных preview-файлов;
  `unavailable` с валидными placeholders не делает сохранённый Project
  повреждённым;
- проверить допустимые размеры generation bbox, raster layers, masks и
  распакованных assets, включая лимиты на координаты и общий объём archive;
- показать понятную ошибку, если файл повреждён, не поддерживается или создан более новой версией приложения.

Изменения формата проходят через явные schema migrations. Старый `.igs` нельзя молча пересохранять в новой схеме без успешной миграции и атомарного save.

## Autosave для `.igs`

Autosave не должен часто пересобирать полный `.igs` archive. Базовое решение MVP:

```text
ImageGen Studio/
└─ autosave/
   └─ {local-project-key}/
      ├─ manifest.json
      └─ snapshots/
         └─ {snapshot-id}/
            ├─ project.json
            └─ assets/
```

Во время работы приложение пишет изменённые части проекта в shadow project directory внутри app data. Это recovery/cache слой, а не пользовательский project file.

Правила autosave:

- JSON state сохраняется с debounce, ориентировочно 500-1500 ms.
- Исполняемый v1 shadow хранит изменённые referenced raster assets и исходные
  ICC, проверяя их size/hash. Masks и future layer types добавляются вместе с
  расширением формата; derived previews не дублируются в document shadow.
- Опубликованный `manifest.json` указывает на один проверенный snapshot;
  незавершённые snapshot directories не являются recovery candidates. При
  пересечении Save A и последующей правки B manifest закрепляет hashes старой
  сохранённой ревизии S и конкретной committing A. Recovery принимает B только
  если текущий `.igs` точно равен S или A.
- Autosave не изменяет основной `.igs` до явного Save.
- Обычная запись в shadow directory является внутренним механизмом защиты и не создаёт пользовательский Home status.
- При запуске приложение проверяет незавершённые document shadow и отдельные staging recovery manifests. Валидный unclean document state или completed staging candidate после неожиданного завершения становится `Recovery available`; прежние pending/running jobs отменяются, а partial outputs не показываются.
- После успешного обычного Save только document autosave state для проекта помечается clean или удаляется; staging recovery остаётся до Add или explicit discard.
- После graceful `Discard Changes` соответствующий shadow state удаляется.
- `Recover` открывает shadow state как dirty `Project` document, когда он есть, иначе сохранённый `.igs`; валидные completed candidates возвращаются в staging, не меняя dirty state сами по себе.
- `Discard Recovery and Open Saved` удаляет оба вида recovery state для проекта и открывает основной `.igs`.
- `Cancel` не изменяет ни recovery candidate, ни основной `.igs`.
- Запись autosave и staging manifest/assets выполняется через temp file + atomic rename с валидацией ссылок и содержимого.
- Main `.igs` save выполняется отдельно: собрать archive во временный файл, провалидировать, затем атомарно заменить исходный project file.

Такой подход сохраняет переносимость `.igs`, но не превращает каждое изменение canvas в перепаковку всего project archive.

## Типизированный доступ к SQLite

Предпочтительный вариант для MVP:

```text
Kysely + SqliteDialect + better-sqlite3 + kysely-codegen
```

Причины:

- Kysely уже знаком по рабочему опыту с PostgreSQL.
- Kysely официально поддерживает SQLite dialect.
- `better-sqlite3` хорошо подходит для embedded SQLite в Node/Electron main process.
- `kysely-codegen` входит в MVP как способ получить типы из реальной SQLite-схемы и отдельно проверить пригодность инструмента для будущего использования в `work-project`.
- Query builder сохраняет SQL-like модель мышления без тяжёлого ORM-слоя.
- SQL migrations являются источником истины для схемы БД, а `DatabaseSchema` генерируется из SQLite после применения миграций.

Правило архитектуры:

```text
Renderer → typed window.api → Electron main process → repositories/services → Kysely → SQLite
```

Renderer, preload и Python worker не должны открывать SQLite напрямую.

### Практические правила

- Создавать один основной `Kysely<DatabaseSchema>` instance в main process.
- Включать `PRAGMA foreign_keys = ON`.
- Использовать WAL mode для нормальной локальной конкурентности чтения/записи.
- Создавать SQLite-таблицы в `STRICT` mode по умолчанию.
- Все записи выполнять через main-process services/repositories.
- Не хранить большие бинарные данные в SQLite.
- Immutable provenance/operational JSON payloads хранить как validated `TEXT`/JSON, а поля для поиска и фильтров нормализовать отдельно.
- Для raw SQL использовать Kysely `sql` template только точечно и с типизированной обёрткой на уровне repository.

### SQLite STRICT tables

Все новые таблицы приложения должны создаваться как `STRICT`, если нет явно зафиксированной причины не делать этого.

Пример:

```sql
CREATE TABLE generation_images (
  id TEXT PRIMARY KEY,
  file_path TEXT NOT NULL,
  width INTEGER NOT NULL,
  height INTEGER NOT NULL,
  created_at TEXT NOT NULL
) STRICT;
```

Причины:

- SQLite по умолчанию использует гибкую type affinity модель.
- `STRICT` tables дают runtime enforcement объявленных типов.
- Это лучше соответствует TypeScript/Kysely-модели, где схема должна быть предсказуемой.

Исключения из `STRICT` допускаются только через отдельное архитектурное решение в docs/ADR или рядом с миграцией. Для JSON payload'ов `STRICT` не мешает: они хранятся как `TEXT`, а структура валидируется отдельно через runtime-схемы.

### DatabaseSchema / kysely-codegen policy

Для MVP `DatabaseSchema` генерируется через `kysely-codegen`:

```text
src/main/db/database.types.ts
```

Предварительный workflow:

```text
run migrations against local app.sqlite or temp schema db
↓
run kysely-codegen
↓
write src/main/db/database.types.ts
↓
use new Kysely<DatabaseSchema>(...)
```

Правила:

- миграции остаются источником фактической SQL-схемы;
- generated `database.types.ts` не редактируется вручную;
- изменение миграции должно сопровождаться обновлением generated DB types;
- если `kysely-codegen` выводит слишком широкий тип для JSON/TEXT payload, уточнение делается на уровне repository mapper или отдельного domain type, а не ручной правкой generated-файла;
- для нестабильных JSON payload'ов использовать `unknown` на DB-слое и валидировать в service/repository mapper;
- если инструмент окажется неудобным для SQLite/Electron, fallback-план — ручной `DatabaseSchema` по паттерну `work-project`, но это не основной путь MVP.

InvokeAI не является образцом для типизированного SQL-доступа: в Python backend он использует raw `sqlite3`, ручные SQL-запросы и Pydantic DTO/validators после чтения из БД. Для ImageGen Studio TypeScript + Kysely даёт более строгую compile-time проверку запросов.

## Storage-модель пресетов

Для MVP пресеты хранятся гибридно:

```text
строгие SQLite-колонки для каталога и применимости
+
typed JSON payload для настроек генерации
```

### Таблица presets

Базовая форма реализована в
[`0017_presets.sql`](../../src/main/db/migrations/0017_presets.sql).
Production migration дополнительно ограничивает workflow enum, типы JSON и
непустые значения и добавляет catalog index. Строгий shared parser валидирует
portable definitions при записи и чтении; SQL JSON checks сами не доказывают
валидность payload.

```sql
CREATE TABLE presets (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  workflow_type TEXT NOT NULL,
  tags_json TEXT NOT NULL DEFAULT '[]',
  favorite INTEGER NOT NULL DEFAULT 0 CHECK (favorite IN (0, 1)),
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
) STRICT;
```

`deleted_at` is a preset-only soft-delete tombstone, recorded as a UTC time.
`NULL` means active. A deleted preset remains in SQLite with its entire
`payload_json` and resource refs, is excluded from active catalog/search and
Apply/New Project selectors, and is available in the Preset Manager's `Deleted`
view for `Restore`. Restore clears `deleted_at` without changing preset identity
or payload. Once 30 days have elapsed since `deleted_at`, cleanup permanently
deletes the row; if the application was closed at expiry, cleanup runs on the
next launch. Neither the preset payload nor its copied resource-reference
metadata is physically removed before expiry. The referenced model files have
their own lifecycle. This preset lifecycle is separate from managed `.igs`
Project Trash.

Production Main выполняет cleanup при запуске и каждый час; один cleanup не
пересекается со следующим. Restore сам проверяет точную границу 30×24 часа UTC,
поэтому просроченную запись нельзя восстановить между sweep. Shutdown
прекращает admission/timer и ждёт принятые preset operations до SQLite close.
Повреждённая deleted запись вызывает атомарный отказ purge с сохранением всех
строк; Main логирует отказ и сохраняет доступность остальных возможностей.
Эта граница квалифицирована в [preset storage research](../engineering/phase-3-preset-storage-research.md);
[production Manager](../engineering/phase-3-preset-manager-research.md) подключает
ручной create/edit/duplicate, Deleted/Restore и защиту transient drafts к этому
API. Project Apply, New Project customization и Save Current/result-to-preset
остаются следующими срезами.

`workflow_type` — категория применимости пресета, а не параметр генерации.

`tags_json` and `favorite` are catalog metadata used for browsing and filtering. They do not belong in `PresetPayload`, because they do not change generation behavior. `tags_json` is validated as a string array at the storage boundary.

На MVP-уровне допустимые значения:

```text
txt2img
img2img
inpaint
```

Смысл:

- `txt2img` — пресет применим к генерации с нуля;
- `img2img` — пресет применим к image-to-image сценарию;
- `inpaint` — пресет применим к inpaint/local edit сценарию.

`workflow_type` classifies intended preset context; it is not a manual Project generation mode. Project derives txt2img/img2img/inpaint/outpaint from target-area content. UI can use preset workflow to rank/filter candidates and validate context, while Apply still copies only explicitly selected sections.

### PresetPayload

`payload_json` содержит типизированные generation sections. Текущим доменным источником формы является `docs/prototype-app/src/prototypes/presets/presets.types.ts`; storage mapper не должен вводить другую группировку полей.

Ниже — предварительный DTO текущего Vue-прототипа, а не production envelope
для `.igs`. В частности, `activationToken`/`negativeToken` у embedding resource
описывают mock-каталог; они не являются гарантированными CivitAI metadata.
Production Project создаёт новый literal `<original safetensors filename stem>`
одинаково для обеих полярностей, использует `trainedWords` только для поиска и
хранит exact resource reference + copied `token` по действующей `.igs` schema.
Это уточнение не меняет формат `.igs`. Production preset persistence остаётся
отдельной незавершённой границей; при её реализации mapper должен использовать
[embedding contract](../features/project/generate-mode/embeddings-selector.md),
не превращая prototype negative aliases в production storage requirement.

Предварительная TypeScript-форма прототипа:

```ts
type PresetWorkflow = 'imageToImage' | 'smartPatch' | 'textToImage'
type SeedPolicy = 'fixed' | 'random' | 'reuse'
type PresetSectionKey =
  | 'cfgRescale'
  | 'denoisingStrength'
  | 'guidance'
  | 'loras'
  | 'model'
  | 'negativePrompt'
  | 'prompt'
  | 'sampling'
  | 'seed'
  | 'size'
  | 'vae'
  | 'vaePrecision'

interface PresetResourceRef {
  id: string
  missing?: boolean
  name: string
  version?: string
}

interface PresetModelRef extends PresetResourceRef {
  baseModel: string
  predictionType: 'epsilon' | 'v_prediction' | 'sample' | null
}

// A preset may retain a null or older non-null Illustrious snapshot; Apply
// preserves it, while Prepare uses the current exact-file library type.

interface PresetLora {
  enabled: boolean
  resource: PresetResourceRef & { triggerPhrases: string[] }
  weight: number
}

interface GenerationPrompt {
  embeddingRefs: GenerationPromptEmbeddingRef[]
  text: string
}

interface GenerationPromptEmbeddingRef {
  resource: PresetResourceRef & {
    // Prototype catalog aliases only; production tokens derive from exact original filename.
    activationToken: string
    baseModel?: string
    negativeToken?: string
  }
  token: string
}

interface PresetPayload {
  cfgRescale?: number
  denoisingStrength?: number
  guidance?: {
    cfgScale: number
    steps: number
  }
  loras?: PresetLora[]
  model?: PresetModelRef
  negativePrompt?: GenerationPrompt
  prompt?: GenerationPrompt
  sampling?: {
    sampler: string
    scheduler: string
  }
  seed?: {
    policy: SeedPolicy
    value?: number
  }
  size?: {
    height: number
    width: number
  }
  vae?: PresetResourceRef
  vaePrecision?: 'Auto' | 'FP16' | 'FP32'
}

interface PresetDefinition {
  description: string
  favorite: boolean
  name: string
  payload: PresetPayload
  tags: string[]
  workflow: PresetWorkflow
}

interface PresetRecord extends PresetDefinition {
  id: string
  updatedAt: string
}

type PresetCreateIntent =
  | { kind: 'manual' }
  | {
      kind: 'project'
      projectName: string
      projectSummary: string
      definition: PresetDefinition
    }

interface PresetApplicationDraft {
  payload: PresetPayload
  selectedSections: PresetSectionKey[]
  sourcePresetId: string
}
```

Правила:

- `payload_json` валидируется runtime-схемой при чтении и записи.
- `PresetDefinition` — editable create-domain object без fake `id`/timestamp. `PresetRecord` появляется только после подтверждённого `Create Preset`; persistence layer одновременно заполняет internal `created_at`/`updated_at`, даже если UI domain record показывает только `updatedAt`.
- `PresetCreateIntent` и source banner metadata (`projectName`, `projectSummary`) являются transient UI context и не сериализуются как preset catalog fields.
- Catalog metadata (`name`, `description`, `workflow`, `tags`, `favorite`) живёт в `PresetDefinition` и строгих columns, но не внутри `PresetPayload`.
- Storage mapper нормализует nullable DB `description` в доменную пустую строку и SQLite `favorite` 0/1 в boolean; UI draft не должен разносить SQL-nullability по форме.
- `workflow_type` storage tokens маппятся на доменные значения: `txt2img` ↔ `textToImage`, `img2img` ↔ `imageToImage`, `inpaint` ↔ `smartPatch`. Storage tokens не показываются в UI.
- Source of truth для model/LoRA/VAE настроек находится внутри `PresetPayload`; prompt content/order хранится в `GenerationPrompt.text`, а embedding dependencies — в sidecar `embeddingRefs` соответствующего `prompt`/`negativePrompt`. Offsets, Danbooru metadata и LoRA trigger refs не сохраняются. Prototype `activationToken`/`negativeToken` не задают дополнительные production поля: новый embedding token берётся из original safetensors filename, а уже скопированный token остаётся неизменным.
- Section inclusion is represented by field presence. An absent field or group is not part of the preset and must not be applied. A second `includedSections` list is not stored, because it would duplicate the payload structure and could drift from it.
- Temporary preset consumers may use an ephemeral `selectedSections` mask inside an in-memory application draft. Apply uses it to choose fields copied into the current project; New Project uses the same shape for the detached initialization payload. The mask is never serialized into `payload_json` or another preset column.
- `sampling`, `guidance`, `size` и `seed` остаются отдельными смысловыми секциями, как в общем `PresetPayloadEditor`; storage не сворачивает их обратно в generic `params`.
- Prototype sampling supports optional named `sampler`, `scheduler` and
  `animaMethod` members. A native-only Anima section does not invent an SD pair.
  Apply copies supplied members only; an omitted member leaves the destination
  unchanged. Explicit declared model-family metadata chooses the controls;
  display labels are not a compatibility API. This is mock authoring, not
  implemented production preset storage.
- `cfgRescale` and `vaePrecision` are independent typed optional payload fields
  and `PresetSectionKey` values; they are not a generic `advanced` section.
  Absence means Apply leaves the current Project value unchanged. Future
  advanced settings require named typed fields and sections rather than an
  `engineSpecific` bag.
- `PresetPayload` represents only portable generation configuration. Smart Patch mask, bounding box, internal resolution, compositing state and source/revision identities are layer properties and must not be serialized into it.
- A Smart Patch `internalResolution` or layer-owned bbox must never be mapped
  implicitly into `PresetPayload.size`; when explicitly included, `size` carries
  portable primary normal-generation bbox width/height, never a fixed Project
  Canvas size or bbox x/y placement.
- Reusing Smart Patch layer/source context is implemented by duplicating the layer, not by extending `PresetPayload` with geometry or mask fields.
- Embeddings не образуют отдельную section/inclusion mask. Наличие `prompt` или
  `negativePrompt` включает plain-text prompt и соответствующий sidecar
  `embeddingRefs`; refs не являются токенами текста или UI chips.
- При нормализации workflow `textToImage` удаляет `denoisingStrength`. Возврат к другому workflow не создаёт поле автоматически.
- Illustrious `predictionType` в Preset хранит только advisory snapshot;
  фактический scheduler mode Prepare берёт из текущей настройки точного файла
  в Model Manager. `epsilon` без подтверждённого значения является видимым,
  редактируемым там default, не доказанным свойством весов.
  Доменный label `v-pred` маппится на worker/storage token `v_prediction`.
  Anima не получает SDXL prediction mode.
- Optional `missing` — runtime/catalog resolution state в текущем prototype DTO. Production mapper может вычислять его по Model Manager registry, но должен сохранять human-readable `id`/`name`/`version` reference metadata, чтобы preset оставался понятным при отсутствии файла.
- `PresetResourceRef.id` является стабильным local resource identity и разрешается через Model Manager records, где остаются CivitAI ids/hash/base-family metadata. Если preset должен копировать дополнительные identifiers для offline diagnostics, они добавляются в доменный ref и runtime schema явно, а не скрываются в несовместимой storage-only форме.
- `has_loras`, `primary_model_resource_id` и похожие derived-поля в MVP не добавляются.
- `engineSpecific` в MVP не добавляется, чтобы не создавать неструктурированный escape hatch заранее.
- LoRA stack хранится внутри payload как часть цельной настройки пресета, а не в отдельной `preset_loras` таблице.
- Если payload versioning понадобится до появления общего preset migration envelope, изменение сначала добавляется в доменные types/runtime schema и Vue prototype; storage spec не вводит скрытое `schemaVersion`, отсутствующее в текущем контракте.
- Если позже понадобится быстрый поиск affected presets перед удалением модели или глобальная проверка missing resources, можно добавить derived/index table вроде `preset_resource_refs`, пересобираемую из `payload_json`.

### Альтернативы

- `Drizzle ORM` — хороший SQLite-first вариант с typed schema и migrations, но менее знаком в этом проекте.
- `Prisma` — удобный generated client, но тяжелее для desktop/Electron и даёт меньше SQL-контроля.
- `node:sqlite` — перспективный встроенный Node.js модуль, но сам по себе не решает типизацию запросов и пока менее очевиден как основной stack choice.
- Plain `better-sqlite3` — максимально простой вариант, но без type-safe query builder.

## Каталоги приложения

Предварительная структура app data:

```text
ImageGen Studio/
├─ database/
│  └─ app.sqlite
├─ runtime/
│  ├─ python/
│  ├─ environments/
│  │  ├─ {active-runtime-id}/
│  │  ├─ {previous-runtime-id}/
│  │  └─ {next-runtime-id}.staging/
│  └─ current-runtime.json
├─ cache/
│  ├─ uv/
│  └─ runtime-downloads/
├─ models/
│  ├─ checkpoints/
│  ├─ loras/
│  ├─ vae/
│  └─ other/
├─ outputs/
│  └─ generations/
├─ workspaces/
│  └─ Uncategorized/
├─ previews/
│  └─ project-thumbnails/
├─ autosave/
│  └─ {local-project-key}/
├─ logs/
│  └─ worker/
└─ temp/
   ├─ downloads/
   └─ generation-staging/{local-project-key}/{session-id}/
```

## Правила целостности

- Python runtime, models, projects и caches имеют независимые lifecycle. Repair/replace runtime не удаляет модели или пользовательские данные, а очистка cache не меняет active runtime.
- `current-runtime.json` заменяется атомарно только после успешного staging self-test. Failed install не изменяет active runtime и не удаляет previous known-good runtime.
- Модель считается установленной только после успешного скачивания, проверки и записи в SQLite.
- Скачивание идёт во временный файл, затем выполняется атомарный перенос в managed directory.
- A supported CivitAI Anima `.safetensors` checkpoint is installed with pinned
  Qwen3 encoder/VAE. The install preview lists all required files and additional
  bytes before consent, and interrupted/failed group installation publishes no
  partial group. The paired components alone do not prove structural
  compatibility; Generate checks checkpoint structure and component compatibility.
  Verified companions may be reused, are not counted as new download bytes and
  remain while another model references them. A missing exact companion blocks
  generation until repair.
- CivitAI model identity и exact model version/file identity хранятся отдельно;
  несколько version records одной модели могут ссылаться на независимые managed
  files и существовать одновременно.
- Default version является catalog preference для новых selections. Смена
  default не обновляет resource references, уже записанные в `.igs`, Presets,
  queue payloads или accepted-result provenance.
- Worker completion creates a temporary candidate, not a persistent project result.
- Generation provenance is created only when a candidate is accepted and never changes afterward.
- Generation provenance stores the actual Illustrious `predictionType` and
  actual seed so the accepted result can be reproduced with the scheduler mode
  used by its frozen job; Anima records its separate flow and exact components.
- Provenance comparison is read-only derived state. Opening or closing it cannot
  mutate provenance or current Project state, and the MVP popover exposes no
  Apply/Recall/Restore action.
- Project thumbnail source of truth хранится внутри `.igs` в `preview/thumbnail.webp`; `previews/project-thumbnails/` является только пересобираемым кэшем.
- Если ML Worker недоступен, Save сохраняет валидный `.igs` со статическими
  preview placeholders и `preview.status=unavailable` только при видимых
  raster pixels; содержимое проекта не теряется. Пустой Project получает
  `preview.status=empty`. Для чистого Project восстановление актуальных
  previews доступно через явное `Rebuild Preview` без искусственного dirty.
- Один и тот же `.igs` нельзя открыть в нескольких `Project` tabs; repeated open фокусирует уже открытую вкладку.
- Удаление файла вне приложения не удаляет историю: UI показывает fallback.
- Удаление или перемещение `.igs` вне приложения не должно ломать БД: UI показывает missing project и может предложить relink/rescan workspace.
- `.igs` является источником истины проекта; SQLite project index можно пересобрать сканированием workspace'ов.
- При применении preset проверяются только выбранные секции. Provenance comparison
  является read-only и только показывает missing-resource diagnostics.
- Другая версия той же CivitAI-модели не считается валидной заменой.
- Model resources have no user-visible soft-delete/Trash state. Removing a
  local resource deletes its managed file after the existing job/reference
  checks; only minimal identity/display metadata needed for missing-resource
  diagnostics may remain. This metadata is not a restorable model copy.

## Что стоит уточнить перед схемой миграций

- Нужны ли дополнительные размеры cache thumbnail'ов сверх `.igs` `preview/thumbnail.webp` и `preview/merged.png`.
- Нужно ли хранить нормализованные поля accepted-result provenance отдельно от JSON для поиска и фильтров.
