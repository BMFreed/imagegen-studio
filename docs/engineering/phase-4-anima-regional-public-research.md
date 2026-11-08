# Anima: положительный regional TXT через обычные Generate и Results

## Граница и основания

Рабочая база: `e097b23937358f0c05aec422758056ab9160c398`. Изменение high risk:
новая операция проходит renderer → IPC/Main capture → owned queue files → installed
worker → provisional PNG → staging receipt → Results → явный Raster Add/Save.
Исследование и реализация входят в ранее разрешённый пользователем следующий этап;
commit и push выполняются после проверки. Визуальная калибровка завершена отдельным
[weight checkpoint](./phase-4-anima-blue-weight-research.md): его конечные результаты
не превращаются в обещание общего качества.

Проверены текущие исходники InvokeAI
`ae06c1bd36218100f89a48ff5b8855751d06a898`:

- `invokeai/frontend/webv2/src/features/generation/core/canvas/`:
  `compileCanvasGraph.ts`, `addRegionalGuidance.ts` и
  `src/workbench/widgets/canvas/invoke/prepareCanvasInvocation.ts`;
- `invokeai/backend/anima/regional_prompting.py`,
  `invokeai/backend/anima/anima_transformer_patch.py`,
  `invokeai/app/invocations/anima/anima_denoise.py`;
- `invokeai/backend/krea2/regional_prompting.py` и его denoising caller;
- `invokeai/app/services/session_queue/session_queue_default.py`:
  admission/claim, cancellation и `retry_items_by_id` с копированием frozen root.

Региональный consumer и even/odd masking адаптированы из Anima. Отдельно именованный
fallback глобального текста взят из Krea2: background support сохраняется; при
пустом background только global columns становятся доступны везде. Это объявленная
межсемейная адаптация, а не изменение смысла прежнего Anima profile. Родной Krea2
joint image/image attention не переносится в Anima cross-attention. Очередь,
завершение процесса, файловые leases и durable Results переиспользуют существующих
Studio-владельцев; второй GPU/queue/publication lifecycle не добавляется.

## Конечный публичный срез

- Capability `anima-regional-txt2img-v1`; queue operation
  `anima-regional-txt2img`; wire `execute-current-canvas-anima-regional`.
- Original Anima Base, CUDA BF16, Current Canvas и фактически полностью прозрачный
  composed target; один item за click, native Euler, steps 1–200, CFG 1–30,
  CFG rescale 0, стороны 64–512 кратно восьми.
- Не более трёх enabled rows; у каждой positive присутствует и не равен `''`.
  Пробелы сохраняют буквальный смысл. Disabled rows остаются в документе и не
  исполняются. Effective regional negatives строго `''`; ordinary global negative
  разрешён при явно local-empty negatives у всех регионов. Наследование и текст
  автоматически не переписываются.
- Только static text; нет global embedding refs, активных regional TI, LoRA,
  region image references, внешнего VAE,
  manual precision override, image/outpaint или Smart regional. Unsupported input
  отказывает явно до постановки в очередь/загрузки модели в соответствующем owner.
- `promptInterpretation: invoke-fragments-v1` и
  `compositionProfile: invoke-krea2-global-support-v1` замораживаются вместе с
  complete recipe и ordered compiled prompts. Веса автора не нормализуются;
  диагностический blue-weight и scene-tail не добавляются.

Предел attention `heads × queries × keys ≤ 33,554,432` сохраняется. Это admission
bound, а не гарантия VRAM или качества. CPU FP32 остаётся частным regression lane;
capability установленного worker зависит от реального CUDA Anima compute support.

## Владельцы, совместимость и отказы

Main использует существующую combined capture lease для одной document revision,
actual target composer/classifier, ordinary `prepareAnimaGeneration` и concrete
one-item planner, затем существующий regional compiler. Complete recipe,
interpretation, checkpoint/Qwen/Wan identity, sampling и seed сохраняются в
операционном payload. Alpha8 идёт в bounded pinned sidecars: wire остаётся малым.

Общий owned transport создаёт fixed-role files, snapshot descriptors и lease;
worker проверяет envelope, descriptor/policy/command/compiled agreement и target
до production loader. Native topology/tokenizer/support checks остаются у реального
consumer до forward. Worker читает snapshot bytes, не управляет удалением Main
staging. Один существующий `executeCurrentCanvasRegional` transport dispatches обе
семьи; новый метод отмены и независимый diffusion loop не вводятся.

Queue migration 0024 расширяет operation CHECK, сохраняя предыдущие строки.
Files-first publication, SQL claim/CAS, cancellation, confirmed physical exit,
progress correlation, staging receipt/recovery и Results остаются общими.
`Cancel` не обещает cooperative JSONL cancellation: текущий client закрывает worker
и подтверждает физический выход перед освобождением lease.

Retry читает frozen operation, не текущую семью/seed/prompts/masks/sampling. Старые
ordinary Anima строки без interpretation marker сохраняют прежний parser; старые
Illustrious и private regional profiles сохраняют прежний смысл. Accepted provenance
проецируется в ordinary `anima-txt2img` base: regional policy/recipe не попадают в
Compare, result-derived presets или accepted provenance.

Malformed bundle/sidecar, changed digest/size, unsafe path, unsupported negatives,
capability mismatch и отсутствующие resources дают отказ без ложного completion.
Late progress не оживляет terminal row. Failed publication остаётся в существующей
receipt/recovery модели. Unconfirmed child exit сохраняет lease, а не объявляет
staging безопасно освобождённым.

## Выполненные проверки ROOT

- **1466 Main cases PASS** в 84 файлах; migration 0024 сохраняет прежние операции,
  все состояния, receipts/cursors и index rows. Включены настоящие combined capture,
  atomic publication, independent frozen Retry и dormant regional metadata cases.
- **35 qualification-guard cases PASS** отдельно. Узкое исключение для обнаруженной
  non-dumpable desktop-команды Bitwarden сохраняет отказ для app-data consumers и
  неизвестных inaccessible процессов; это developer tooling, не поведение worker.
- **57 новых Python cases PASS**, включая original CPU processors/SDPA, progress,
  restoration и dormant-ref exact contexts/predictions/RGB. **149 соседних cases
  квалифицированы** как 148 первоначальных PASS и отдельный PASS исправленного
  capability-tail oracle; первоначальный прогон с одним assertion FAIL сохранён.
  Итого 206 distinct Python cases, не выданных за один неизменённый suite run.
- **200 browser cases PASS**, включая два новых renderer scenarios; это не ML proof.
  Полные TypeScript/Vue typecheck, strict basedpyright (0 errors), scoped ESLint/Ruff
  и production build PASS. Обычное Vite предупреждение о размере bundle остаётся.

Реальные проверки также обнаружили и закрыли три перехода: Retry должен проверять
durable Anima context через существующий queued verifier, queue detail parser должен
распознавать новую Anima operation, а старые Illustrious resolver methods должны
захватываться синхронно в конструкторе. Независимый source review обнаружил mismatch
dormant authored refs: Python теперь переиспользует существующие reference/active
selection validators, сохраняя metadata и отказ active TI. Прежние assertions
legacy tests сохранены; новые family guards уточняют расширенный transport union.

## Installed Generate, Cancel, Retry и сохранённый Raster

Использован один канонический non-editable runtime worker 0.14 и existing
payload-refresh owner. Настоящий ModelRepository/ModelService регистрирует и
независимо проверяет original Anima architecture checkpoint, pinned Qwen и Wan по
исходным read-only путям. Модели и environment не копировались.

Фиксированная сцена из предыдущего checkpoint: 512², origin `(-13,5)`, seed123,
Euler20/CFG4, global `(two white cats)1.25 on one bench`, negative `(blur)0.75, noise`,
local `(red scarf)1.5, one white cat` / `(blue scarf)1.5, one white cat` и явные
local-empty negatives. Alpha128 overlap сохраняет 544/512 sampled queries,
32 overlap и нулевой background. Тексты не подбирались заново.

`qualify-installed-anima-regional.mjs` вошёл через настоящие renderer/IPC и default
RuntimeManager. Три native requests дали progress **1..20**, **1..3 и Cancel**, затем
**1..20 при frozen Retry** после сохранения новых текстов, масок, модели, Heun/steps2,
seed999 и перезапуска. Два completion, ни одного ложного completion при Cancel.
Frozen payload и alpha/policy/compiled inputs остались exact; контроль и Retry
совпали по всем RGB bytes. Контроль также совпал с прежним seed123 PNG:
RGB SHA256 `f290c898ba5c166f70d678cce8f1be637bbbe9feab66ed2964488352f3b2890f`.

Основной report **остаётся FAILED**: после успешного настоящего Results Add harness
ошибочно проверил `kind` у UI Raster DTO. У DTO есть source-role fields, а `kind`
принадлежит portable layer. Original Add Undo/Redo до ошибки не исполнялся и в этом
installed checkpoint остаётся **UNVERIFIED**. Изменение production behavior для
обхода assertion не вводилось.

Отдельный `qualify-installed-anima-regional-continuation.mjs` **PASS**, без новых
Generate/Retry/accept calls или inference wires: настоящий Home Recover восстанавливает
добавленный Raster; Hide→Undo→Redo→Undo проверяет новую visibility history, затем
явный Save/ZIP read/reopen/signed-image read сохраняют точные PNG/RGB, Raster ID и
ordinary `anima-txt2img` provenance. Edited draft с seed999/model-null остаётся
текущим. Queue, receipts и seed cursor не меняются. Original Add history не
переживает restart по существующему контракту; visibility history её не подменяет.
Production/build pins сравниваются до и после continuation. Signed Raster PNG
читается через существующий Main `net.fetch`, без ослабления renderer CSP.

Whole pre-catalog SQLite comparison отдельно обнаруживает первоначальный Home cache
refresh: у 117 старых `project_index.file_fingerprint` меняется только кешированный
device prefix `66306→66308`; inode/size/time suffix остаётся прежним. Этот переход
происходит до native-r2 initial SQL snapshot. Там и в continuation timestamp-only
cache exception остаётся точным. ROOT отдельно перепроверил все 117 pre-first-UI
`.igs` по SHA и recorded stat; package bytes не менялись. Numeric Node/Python time
comparison precision обозначена в `bootstrap-cache-refresh.json`. Валидный derived
cache не откатывался. Это не утверждение о byte-exact неизменности всей БД до
первого запуска Home.

Root открыл семь выбранных full screenshots нормального результата, progress,
edited state, Add, Recovery, visibility history и reopened Raster под `ui-audit`;
material local layout finding не найден. Это bounded self-review, не независимая
UX/accessibility или visual-quality приёмка. Предыдущий full-scene NOT_QUALIFIED
сохраняется: у этого seed всё ещё нет запрошенной скамьи.

Первый enqueue harness timeout30s до публикации queue row, ошибочный SHA аргумент
continuation и первая renderer-fetch попытка continuation сохранены отдельно и
не считаются PASS/semantic RED. Последняя использовала запрещённый CSP connect-src
для `igs-layer:`; исправлен проверочный consumer через существующий Main helper.

Native runs последовательны. У каждого unit deadline600s и zero swap; отдельные
native scope10GiB + launcher2GiB дают aggregate ceiling12GiB. Записанный native
peak9,808,130,048B не является общей capacity guarantee. Production installed path
не устанавливает experimental CUDA allocator fraction0.75; такой VRAM ceiling и
GPU peak здесь **не измерены**. Подробного native anon/file peak split также нет.
Логические shape/mask bounds и фактический host limit не объявляются fit guarantee.

## Семантические мутации и сохранённое evidence

В изолированной обычной source copy, без Git worktree или изменений live checkout,
проверены три независимых мутации: игнорировать public global-support tag на original
native consumer; ошибочно разрешить непустой effective regional negative в advisory;
сменить immutable `originRequestId` при Retry, сохранив валидный payload/manifest.
Последняя проверяет lineage, не выдаётся за изменение pixel conditioning.

Девять serial units дали **18 selected executions: 15 GREEN / 3 semantic RED**.
Каждый mutant сохраняет GREEN соседний ordinary/legacy control; exact restoration
возвращает GREEN. Все 1555 snapshotted source files и live checkout восстанавливаются
byte-exact. Первая mutation попытка с отсутствующим pytest temp parent дала два
setup ERROR и исключена. Authored zero-ML continuation не участвовал в mutation
snapshot и прямо обозначен как отдельный consumer.

Compact ROOT evidence находится в
`~/.codex/artifacts/imagegen-studio/runs/anima-regional-public/20261108-txt2img`:
`qualification-summary.json`, `native-observations.json`,
`continuation-observations.json`, оба SQLite snapshots, final `.igs`, source/Invoke
archives, mutation patches/records, JUnit/logs и retained-payload archive. Исторические
payload paths внутри reports восстанавливаются из archive перед replay. Внешние
original weights, канонический runtime/catalog и предыдущий checkpoint защищены.
Source reviews CLEAN после указанных correction passes; runtime outcomes принадлежат
ROOT, retained-byte review не является независимым native rerun или deletion authority.

## Lifecycle closure

Независимый read-only audit сверил все **6521 entries** retained set: 5298 regular
files, 1107 directories, 116 symlinks и восемь hardlinked fixture paths, замкнутых
внутри набора. Invoke12 и qualification1555 source members, PNG/IGS/SQLite и causal
records замкнуты. Audit не давал deletion authority и не повторял runtime.

ROOT затем выполнил свежие physical-exit/restoration/readers/incoming gates:
41 resource reports, 44 observed cgroups, восемь завершённых readers и 180 lifecycle
records. Удалены только `RUN/payloads`, owned `t-arp-20261108` и точный уже idle
worker-refresh cache leaf `worker-upgrade-6U5jwb`. В deletion-only interval allocated
root уменьшается **25,254,813,696→24,937,639,936B**, то есть **317,173,760B**.
Все bytes/metadata находятся в verified retained archive; symlink targets не
обходились. Канонические runtime/catalog, original weights и текущий refresh report
остаются на месте с reciprocal dependencies. Последующий final source/docs reader
работает по compact archive, после исторического deletion gate.

Протокол, public UI/queue и accepted provenance проверены только в описанном
конечном срезе; release Install/Repair и полный обещанный MVP не заявлены.

Public admission этого конечного среза не означает всю Anima/regional functionality,
visual quality, release readiness или снятие остальных обещаний. PP-001/005/007/008
остаются «Пока не обещать». Smart target permissions, frozen-work independence и
regional provenance exclusions сохраняются.
