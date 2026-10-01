# Product Promises

Этот документ фиксирует продуктовые обещания ImageGen Studio и явные
не-обещания рядом с ними. Это нормативные ограничения для product scope, UX,
прототипов и production-реализации, а не набор маркетинговых слоганов.

Публично использовать обещание можно только тогда, когда его подтверждают
реальный пользовательский flow, UI и тесты. До этого оно остаётся принятым
направлением продукта и ограничивает новые решения, но не выдаётся за уже
готовую возможность.

Каждое обещание в этом реестре должно отвечать на четыре вопроса:

1. Что именно получает пользователь?
2. Какую понятную выгоду это даёт?
3. Чего продукт сознательно не обещает?
4. Подтверждено ли обещание реальным пользовательским flow?

Точные domain contracts, UX-решения, data boundaries, prototype gaps и
проверяемые инварианты живут в linked supporting contracts. Они доказывают и
ограничивают обещание, но не должны превращать его формулировку в feature spec.

## Матрица обещаний

Публичный статус относится к готовому продукту. Прототип может доказывать
взаимодействие, но не заменяет filesystem, worker или persistence evidence.

| ID     | Пользовательский результат                | Продуктовый статус   | Публичный статус | Supporting contract и evidence/gaps                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ------ | ----------------------------------------- | -------------------- | ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PP-001 | Готовый понятный интерфейс                | Принятое направление | Пока не обещать  | [Композиция](./contracts/interface-composition.md), [desktop UI review](./engineering/desktop-ui-layout-review.md): Electron shell, базовый Home/Project и Model Manager; полный Home, preferences и Preset Manager ещё не подключены; [исправления аудита](./engineering/product-audit-fixes.md): standalone Home/Project session mapping проверен                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| PP-002 | Понятное намерение controls               | Принятое направление | Пока не обещать  | [Явные действия](./contracts/explicit-intent.md): production Create/Import/Save, install/repair и exact checkpoint явные; [syntax hints](./engineering/project-prompt-diagnostics-research.md) локальны и не меняют текст/Save; [Generate actions](./engineering/phase-2b-generate-actions-research.md) подключены в узком Illustrious txt2img срезе; Apply и полный resource handoff отсутствуют                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| PP-003 | Понятные роли и места управления          | Принятое направление | Пока не обещать  | [Ownership](./contracts/canonical-ownership.md): базовые Electron Home/Project и Model Manager подключены; Preset Manager, resource handoff и result history остаются незавершёнными; [исправления аудита](./engineering/product-audit-fixes.md): вкладки прототипа сохраняют document ownership                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| PP-004 | Управляемые модели и версии               | Обязательный MVP     | Пока не обещать  | [Библиотека моделей](./contracts/managed-model-library.md): CivitAI Illustrious/Anima `.safetensors` install/version/repair и custom Anima с закреплёнными Qwen3/VAE проверены в SQLite/filesystem tests; Electron smoke покрывает Model Manager prediction override по SHA-256+size, точный Project checkpoint, LoRA stack и Project → Manager focus; [первый SDXL structural preflight](./engineering/phase-2b-inference-worker-research.md) перед Prepare проверен; полная совместимость/загрузка managed моделей, embedding/VAE selectors и обратный handoff ещё отсутствуют; [исправления аудита](./engineering/product-audit-fixes.md): известный размер обязателен до install                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| PP-005 | Результат помнит настройки                | Обязательный MVP     | Пока не обещать  | [Provenance](./features/project/generate-mode/generation-provenance.md#vue-prototype-coverage): mock comparison/result-to-preset; Project сохраняет sampler/scheduler draft; [внутренний handoff](./engineering/phase-2b-internal-handoff-and-conditioning.md) связывает frozen Illustrious job с queue/processor/staging на реальных SQLite/filesystem, а отдельный GPU smoke проверяет dual-CLIP conditioning; [typed Raster storage](./engineering/phase-2b-accepted-provenance-storage.md) переносит проверенный Illustrious context без локальных путей и сохраняет запись через `.igs`/shadow; [renderer Generate](./engineering/phase-2b-generate-actions-research.md) подключён к frozen queue/staging; сравнение настроек и полный pipeline ещё отсутствуют; [явный Add Raster](./engineering/phase-2b-raster-acceptance-research.md) и [Project Undo/Redo](./engineering/phase-2b-project-undo-research.md) сохраняют/откатывают принятые слои с provenance; result-to-preset отсутствует; [исправления аудита](./engineering/product-audit-fixes.md): actual seed проходит processor → Add → Save; [prepared-batch provenance](./engineering/phase-2b-batch-planning-research.md) сохраняет selected seed behavior через Add/portable Save без выдуманного legacy default                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| PP-006 | Настройки сохраняются и переиспользуются  | Обязательный MVP     | Пока не обещать  | [Presets](./features/presets.md#known-pp-006-prototype-gaps): Project diagnostics и сквозной Apply на mocks; resource handoff/persistence не завершены                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| PP-007 | Пользователь владеет переносимым проектом | Обязательный MVP     | Пока не обещать  | [Document lifecycle](./features/project/document-lifecycle.md) и [Phase 2A evidence](./engineering/phase-2a-project-storage-research.md#production-sampling-draft-controls): Electron с dev worker проверяет Save/reopen, recovery, Move/Copy `.igs`, raster Canvas/controls, PNG import, previews/Home thumbnails/Rebuild, prompts/Seed/Steps/CFG и sampler/scheduler draft, read-only Project prediction display из Model Manager, LoRA stack/relink, [prompt actions](./engineering/project-prompt-actions-research.md), native-close Save; [Electron shutdown](./engineering/phase-2b-electron-shutdown.md) отменяет pending jobs и ждёт worker exit; проверен per-Project close с отменой своих jobs и staging tombstones, а при недоступном storage — явный close с сохранением recovery; [Results recovery view](./engineering/phase-2b-results-recovery-ui.md) проверяет, что Save не включает непринятый кандидат в `.igs`; [явный Add Raster](./engineering/phase-2b-raster-acceptance-research.md) сохраняет проверенный результат в shadow до удаления staging; [Project Undo/Redo](./engineering/phase-2b-project-undo-research.md) связывает prompt focus sessions и document history; [Seed Reuse checkpoint](./engineering/phase-2b-seed-reuse-research.md) проверяет document-scoped cursor и переносимый Save snapshot без dirty/Undo; [dynamic settings/preview](./engineering/phase-2b-dynamic-preview-research.md) проходят typed draft sync, Undo/Redo, shadow и настоящий Save/reopen, открытие preview не меняет документ; [qualified target transport](./engineering/phase-2b-inference-target-composition.md) готовит frozen Canvas через тот же inference child с shared PNG/ICC/alpha verification; [Generate actions](./engineering/phase-2b-generate-actions-research.md) добавляют retained capture и serial drain без document mutation; [Queue Manager](./engineering/phase-2b-queue-manager-research.md) сохраняет staging/seed/документ при очистке operational history и проверяет current identity для Retry; installer и полный pipeline отсутствуют; [Results thumbnails](./engineering/phase-2b-result-thumbnails-research.md): optional worker WEBP/cache и placeholder сохраняют PNG, recovery/export/Add, seed и `.igs`; Queue Manager previews/navigation остаются открытыми                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| PP-008 | Результаты принимаются явно               | Обязательный MVP     | Пока не обещать  | [Staging](./features/project/generate-mode/generation-results.md#production-candidate-image-export-checkpoint): mock acceptance, production repository для validated candidate/seed recovery и приватный processor с cancel/late-done guards; [Project → staging handoff](./engineering/phase-2b-internal-handoff-and-conditioning.md) проверен с подставным inference transport и настоящей SQLite/filesystem; [Queue history lifecycle](./engineering/phase-2b-queue-history-research.md) проверяет frozen retry и terminal cleanup с сохранением recovery кандидата на SQLite/filesystem; [Electron shutdown](./engineering/phase-2b-electron-shutdown.md) отменяет pending jobs при app close; per-Project close/discard проверен SQLite/filesystem и Electron smoke, включая degraded recovery close; [Results recovery view](./engineering/phase-2b-results-recovery-ui.md) проверяет typed IPC, приватный PNG preview, Save/Cancel/discard после crash/restart; [Save Candidate Image](./engineering/phase-2b-candidate-image-export.md) даёт отдельный PNG без принятия/удаления staging; [typed provenance storage](./engineering/phase-2b-accepted-provenance-storage.md) и [явный Add Raster](./engineering/phase-2b-raster-acceptance-research.md) связывают проверенный кандидат с shadow/Undo и последующим Save в `.igs`; [Project Undo/Redo](./engineering/phase-2b-project-undo-research.md) отменяет/повторяет multi-Add одним шагом без возврата staging; [Acceptance journal](./engineering/phase-2b-acceptance-journal-research.md) восстанавливает точный captured cleanup после crash; [Seed Reuse checkpoint](./engineering/phase-2b-seed-reuse-research.md) связывает local cursor, Prepare и явный `.igs` Save; [ранний Add](./engineering/phase-2b-early-raster-acceptance.md) подтверждает точный набор sibling jobs, ждёт worker exit и сохраняет соседние сессии; [qualified batch grouping](./engineering/phase-2b-batch-grouping-research.md) атомарно публикует concrete jobs с общими batch/session IDs и предварительной проверкой recovery capacity; [prepared batch planning](./engineering/phase-2b-batch-planning-research.md) раскрывает bounded concrete prompts с начальным cap 32 jobs и byte preflight, назначает seeds от одной подготовленной базы и переносит seed behavior в provenance; [dynamic settings/preview](./engineering/phase-2b-dynamic-preview-research.md) теперь сохраняют настройки draft и показывают concrete pairs, cap 32, ошибки и truncation без создания jobs; [qualified target transport](./engineering/phase-2b-inference-target-composition.md) добавляет проверенную Canvas composition к тому же serial inference client; [Generate из UI](./engineering/phase-2b-generate-actions-research.md), pending/running queue, scoped current Cancel и exact replacement подключены; [Queue Manager](./engineering/phase-2b-queue-manager-research.md) добавляет global history, pending/current Cancel, qualified frozen Retry с document gate и confirmed terminal cleanup без потери staging/seed; Smart Patch variants и derived history index ещё отсутствуют; [исправления аудита](./engineering/product-audit-fixes.md): допустимое отличие actual seed принимается, tampering receipt не проходит; [Denoising progress](./engineering/phase-2b-generation-progress-research.md): request-scoped callbacks, отдельный transient IPC и точная привязка к running job без изменения queue/staging/Project; [Results thumbnails](./engineering/phase-2b-result-thumbnails-research.md): optional worker WEBP/cache и placeholder сохраняют PNG, recovery/export/Add, seed и `.igs`; Queue Manager previews/navigation остаются открытыми |

### Статусы и доказательства

Продуктовый статус определяет обязательство для новых решений. Публичный
статус определяет, что можно утверждать о доступной пользователю версии:

- `можно обещать` — полный flow доступен и подтверждён UI, кодом и проверками;
- `обещать аккуратно` — подтверждён только явно названный ограниченный flow;
- `пока не обещать` — есть существенные gaps или только prototype/architecture.

При изменении публичного статуса запись и матрица обновляются вместе.
Supporting contract указывает UI/entry points, проверки, известные ограничения
и ревизию/результат прогона, на котором основано повышение статуса.
Наличие файла теста не равно успешному прогону; mocked Save не доказывает запись
`.igs`. За актуальность evidence отвечает изменение, затронувшее promise.

Подход адаптирован из work project capability registry: короткий пользовательский
результат, negative scope и отдельная оценка готовности. Принятие обещания
само по себе не повышает его публичный статус.

## Принятые обещания

- [PP-001: Понятный интерфейс вместо собираемого workbench](#pp-001-понятный-интерфейс-вместо-собираемого-workbench)
- [PP-002: Явное намерение вместо магического control](#pp-002-явное-намерение-вместо-магического-control)
- [PP-003: Одна сущность, один владелец и одно каноническое место](#pp-003-одна-сущность-один-владелец-и-одно-каноническое-место)
- [PP-004: Управляемая библиотека моделей вместо ручной работы с файлами](#pp-004-управляемая-библиотека-моделей-вместо-ручной-работы-с-файлами)
- [PP-005: Принятый результат хранит настройки генерации](#pp-005-принятый-результат-хранит-настройки-генерации)
- [PP-006: Настройки генерации можно сохранять и переиспользовать](#pp-006-настройки-генерации-можно-сохранять-и-переиспользовать)
- [PP-007: Проект принадлежит пользователю](#pp-007-проект-принадлежит-пользователю)
- [PP-008: Генерация меняет проект только по явному решению](#pp-008-генерация-меняет-проект-только-по-явному-решению)

## PP-001: Понятный интерфейс вместо собираемого workbench

**Продуктовый статус:** принято как продуктовое направление.

**Публичный статус:** пока не обещать как готовую возможность — Electron shell,
базовые Home/Project и Model Manager уже подключены; полный Home, сохранение
preferences и production Preset Manager ещё не подтверждены.

[Исправления аудита](./engineering/product-audit-fixes.md): standalone Project и
Home используют выбранную document session; переключения и сохранение UI state
проверяются browser regressions на обоих маршрутах прототипа.

### Обещание

Каждый экран ImageGen Studio имеет стабильное назначение и готов к работе.
Пользователь настраивает свою творческую работу, не собирая интерфейс из панелей.

### Пользовательская выгода

Пользователь занимается изображением без изучения docking, раскладки widgets
и отдельного сохранения layout presets.

### Явное не-обещание

- Произвольный docking, замена и дублирование основных панелей.
- Превращение одного режима в другой через пользовательский layout.

Ограниченные resize/collapse preferences допустимы по supporting contract.

### Supporting contract

[PP-001 Supporting Contract](./contracts/interface-composition.md) определяет
точные UX/data boundaries, исключения, инварианты и текущие gaps.

## PP-002: Явное намерение вместо магического control

**Продуктовый статус:** принято как продуктовое направление.

**Публичный статус:** пока не обещать как готовую возможность — Create/Import/Save,
Model Manager install/repair и выбор exact checkpoint используют production
команды; [Generate](./engineering/phase-2b-generate-actions-research.md) теперь подключён к typed main/queue в узком Illustrious txt2img срезе. Apply и полный resource handoff ещё не подключены. Локальные
проверки install не доказывают живую загрузку CivitAI в release-сборке.
Локальные [syntax diagnostics prompt](./engineering/project-prompt-diagnostics-research.md)
дают объяснения без автоматического изменения текста и блокировки Save;
проверены Electron Save/reopen и отдельный prototype Generate/Apply flow.

### Обещание

У каждого элемента управления одна понятная основная роль. Название и контекст
заранее объясняют действие; поиск не превращается незаметно в создание, импорт
или установку.

### Пользовательская выгода

Пользователь может искать и выбирать без риска случайно изменить данные
из-за формы введённой строки или пустого результата.

### Явное не-обещание

- Универсальный input, неявно переключающийся между разными намерениями.
- Скрытая mutation при поиске или навигации.

Autocomplete, явный creatable selector и command palette допустимы в границах
одного объяснимого намерения; точные исключения определены контрактом.

### Supporting contract

[PP-002 Supporting Contract](./contracts/explicit-intent.md) определяет
точные UX/data boundaries, исключения, инварианты и текущие gaps.

## PP-003: Одна сущность, один владелец и одно каноническое место

**Продуктовый статус:** принято как продуктовое направление.

**Публичный статус:** пока не обещать как готовую возможность — базовые Home/Project
и Model Manager работают через production команды; Preset Manager остаётся
прототипом, полный resource handoff и история результатов ещё не подключены.

[Исправления аудита](./engineering/product-audit-fixes.md) проверяют, что
standalone Project tabs редактируют выбранный документ, сохраняют независимые
Undo/dirty/queue и показывают Home. Это evidence прототипа, не filesystem proof.

### Обещание

У проектов, моделей, пресетов и результатов есть понятные роли и места
управления. Пользователь знает, где найти и изменить нужное, без выбора между
несколькими конкурирующими хранилищами одной работы.

### Пользовательская выгода

Устойчивый словарь и расположение настроек помогают понимать, что изменится
и какой части работы принадлежит это изменение.

### Явное не-обещание

- Несколько независимых мест полного управления одной сущностью.
- Новые пользовательские категории только ради внутренних storage/API types.

Несколько shortcuts к одному manager и read-only projections допустимы.

### Supporting contract

[PP-003 Supporting Contract](./contracts/canonical-ownership.md) определяет
точные UX/data boundaries, исключения, инварианты и текущие gaps.

## PP-004: Управляемая библиотека моделей вместо ручной работы с файлами

**Продуктовый статус:** принято как обязательный MVP scope.

**Публичный статус:** пока не обещать как готовую возможность. В production
Model Manager реализованы локальная установка из CivitAI URL, проверка целостности,
repair и независимые версии, в том числе custom Anima с закреплёнными Qwen3/VAE;
их пути проверены с SQLite и файловой системой.
Production Project выбирает точную установленную версию checkpoint и сохраняет
проверенную main ссылку в `.igs`; смена Default и исчезновение файла не
подменяют этот выбор. После переноса `.igs` пользователь может явно связать
сохранённую версию с точной установленной копией CivitAI-файла; меняются только
локальные ID, а правка сохраняется обычным Save. Загрузка моделей в worker,
структурная проверка, embedding/VAE selectors, связи с Presets и provenance
ещё не реализованы.

Project → Model Manager теперь фокусирует выбранный checkpoint и помечает его
точную версию без смены Default или Project reference; Electron smoke проверяет
повторное открытие после фильтров и предупреждение при отсутствующем локальном
ID. Обратный переход и прочий resource handoff остаются открытыми.
Принятый [контракт](./contracts/managed-model-library.md)
разрешает установку любого поддерживаемого CivitAI Illustrious/Anima
`.safetensors` checkpoint. Illustrious prediction override хранится по точным
SHA-256 и размеру файла; `epsilon` предлагается как явно обозначенное предположение,
если нет подтверждённого значения. SHA-256 остаётся проверкой целостности и
identity. Текущий код устанавливает такие checkpoints, редактирует тип только в
Model Manager и показывает его в Project read-only. Prepare повторно хеширует
точный файл и берёт current effective type независимо от advisory snapshot в
`.igs`, включая прежние non-null и `null`. Frozen контекст фиксирует фактический
тип; если override изменился до materialization, старый контекст отвергается.
Model Manager и Project display проверены в Electron smoke; первый SDXL
structural preflight и локальный GPU worker с ограниченным dual-CLIP
conditioning проверены отдельно от
Electron dispatch. Их форма не доказывает Illustrious lineage, полную
совместимость модели или поддержку всего MVP pipeline. Для custom Anima показаны условия
обязательных компонентов и объём выбранного файла; SQLite/filesystem tests
проверяют откат поздней ошибки установки при repair компонента.

Project LoRA stack уже хранит точную проверенную версию, вес и enabled state;
добавление/удаление не переписывают prompt или embedding refs. Выбор и Save
проверены через Electron, recovery — через реальную SQLite/файловую систему.
Portable relink для LoRA проверен на двух библиотеках SQLite и в Electron:
только локальные ID меняются после проверки точного CivitAI-файла; настройки
и metadata остаются прежними. В Electron prompt подсказки и подсветка берут
триггеры выбранной точной версии, независимо от Default. Disable/remove и потеря
файла убирают контекст, сохраняя текст; неизвестное семейство не подтверждает
совместимость. [Проверки prompt](./engineering/project-lora-prompt-research.md).
Применение LoRA в inference ещё не реализовано.

[Размер файла до установки](./engineering/product-audit-fixes.md) берётся из
CivitAI `sizeKB` либо проверенных локальных exact bytes для repair/reuse. Без
корректного известного размера Main не создаёт install job, UI объясняет отказ.
Source estimate не заменяет проверку скачанных bytes/hash.

### Обещание

Пользователь выбирает модель и версию с CivitAI, а ImageGen Studio управляет
загрузкой, metadata и локальной библиотекой. Обновления устанавливаются явно
и сохраняют возможность пользоваться прежними версиями, не меняя настройки
существующих проектов и пресетов.

### Пользовательская выгода

Не нужно вручную скачивать и раскладывать файлы, собирать сведения о модели
или помнить, какая её версия использовалась в работе.

### Явное не-обещание

- Основной workflow через ручное скачивание и раскладывание файлов.
- Редактирование source metadata и кастомизация model cards.
- Поддержка любой модели, универсальный marketplace или silent auto-update.
- Гарантия повторной загрузки файла, который больше недоступен у источника.

Local import может появиться отдельным flow; подробные ограничения сохранены
в supporting contract.

### Supporting contract

[PP-004 Supporting Contract](./contracts/managed-model-library.md) определяет
точные UX/data boundaries, исключения, инварианты и текущие gaps.

## PP-005: Принятый результат хранит настройки генерации

**Продуктовый статус:** принято как обязательный MVP scope.

**Публичный статус:** пока не обещать как готовую возможность. Production
Electron принимает выбранные проверенные Illustrious `txt2img` candidates через
[явный Add Raster](./engineering/phase-2b-raster-acceptance-research.md): Main
сверяет frozen context и PNG, создаёт слои с immutable provenance, записывает
dirty recovery shadow до очистки staging, а явный Save переносит результат в
`.igs`. Принятые слои проходят Save/reopen и перенос файла.
Project-local Undo/Redo возвращают принятые Raster Layers вместе с immutable
provenance как одну document-операцию; история остаётся только в открытой сессии.
Сравнение настроек и result-to-preset остаются в прототипе.

[Typed provenance storage](./engineering/phase-2b-accepted-provenance-storage.md)
содержит точный checkpoint/prediction type, prompts, sampling, seed и bbox без
локальных путей и Regional Guidance.
[Prepared-batch checkpoint](./engineering/phase-2b-batch-planning-research.md)
добавляет selected seed behavior в новые frozen/accepted записи и проверяет
его через Add/portable Save; legacy отсутствие поля остаётся unspecified.
[Внутренний handoff](./engineering/phase-2b-internal-handoff-and-conditioning.md)
и [GPU boundary](./engineering/phase-2b-inference-worker-research.md) проверены
отдельно. [Generate из Electron](./engineering/phase-2b-generate-actions-research.md) подключён к frozen batch admission и serial queue/staging. Release inference runtime и полный MVP
pipeline с LoRA/embeddings/advanced options ещё отсутствуют.

[Исправления аудита](./engineering/product-audit-fixes.md) связывают реальный
processor → staging → Add → Save/reopen: provenance хранит проверенный actual
seed даже при отличии от planned seed; изменение staging seed без matching
completion receipt не принимается. Inference transport в этих tests подставлен.

### Обещание

Каждый принятый результат хранит зафиксированные настройки генерации и
технический контекст запуска. Пользователь может посмотреть сохранённые
настройки, сравнить их с текущими и использовать как основу нового пресета.

> Принятый результат хранит свои сохранённые настройки; текущая работа не
> переписывает прошлое.

### Пользовательская выгода

Пользователь может изучать связь между результатом и настройками генерации, не
восстанавливать их по памяти и не создавать заранее отдельный preset для каждого
удачного изображения.

### Явное не-обещание

ImageGen Studio не обещает:

- автоматически откатывать или изменять текущую работу при просмотре прошлого
  результата;
- превращать сведения о генерации в полную историю всех состояний проекта;
- сохранять Regional Guidance в происхождении результата, сравнивать его с
  текущими регионами или переносить в пресет. Поэтому запись результата не
  восстанавливает полную региональную конфигурацию, повлиявшую на изображение;
- побитово идентичный output на другом hardware/backend/runtime только на
  основании одинаковых настроек.

### Supporting contract

Точные правила acceptance, immutable provenance, сравнения, preset mapping,
Smart Patch boundaries, storage и проверяемые инварианты определены в
[PP-005 Supporting Contract: Generation Provenance](./features/project/generate-mode/generation-provenance.md).

Связанные domain contracts:

- [Presets](./features/presets.md) — создание редактируемого preset из
  переносимых настроек результата;
- [Smart Patch Layer](./features/project/generate-mode/smart-patch-layer.md) —
  ownership mask, bbox, internal resolution и compositing state;
- [Data Storage](./specs/03-data-storage.md#generation-provenance) — хранение
  provenance внутри `.igs` и границы derived indexes.

Публичный статус меняется с `пока не обещать` только после того, как supporting
contract подтверждён реализованным пользовательским flow, UI и regression
tests.

## PP-006: Настройки генерации можно сохранять и переиспользовать

**Продуктовый статус:** принято как обязательный MVP scope.

**Публичный статус:** пока не обещать как готовую возможность — prototype flow
ещё имеет diagnostic gaps, а production persistence не реализован.

### Обещание

Пользователь может сохранить удачную комбинацию настроек генерации и
переиспользовать её в другой работе. До применения пресета ImageGen Studio
показывает, что изменится, и честно предупреждает, если выбранным для применения
настройкам нужна недоступная модель или другой ресурс.

> Настройки можно сохранить и применить снова; проблемы с необходимыми
> ресурсами видны до применения.

### Пользовательская выгода

Пользователю не нужно вручную собирать удачный набор настроек заново или
рисковать текущей работой ради проверки старого пресета. Он заранее видит
применяемые секции и проблемы с ресурсами, а затем сам решает, что использовать.

### Явное не-обещание

ImageGen Studio не обещает:

- незаметно заменять отсутствующую модель или другой ресурс похожим;
- применять неизвестные или проблемные настройки без предупреждения;
- сохранять в пресете состояние слоя, маску или полную историю проекта;
- гарантировать одинаковое изображение только потому, что использован тот же
  preset;
- поддерживать live-связь, при которой последующее редактирование preset
  автоматически изменяет уже созданные проекты.

### Supporting contract

Create/edit/apply flows, partial application, detached drafts, missing-resource
validation, Smart Patch boundaries, storage и проверяемые инварианты определены
в [PP-006 Supporting Contract: Presets](./features/presets.md).

Публичный статус меняется с `пока не обещать` только после устранения prototype
gaps, перечисленных в supporting contract, и подтверждения production flow
тестами.

## PP-007: Проект принадлежит пользователю

**Продуктовый статус:** принято как обязательный MVP scope.

**Публичный статус:** пока не обещать как готовую возможность — reader/writer
`.igs`, production Home/Project IPC, bbox Save/reopen, document shadow, Move/Copy
`.igs` и бесконечный raster Canvas проверены на файлах и в Electron. Изменение
свойств и порядка Raster Layers прошло сервисные тесты с реальными файлами;
Electron проверяет видимость, opacity, blend mode, lock и перестановку мышью/через
меню до Save и после reopen. PNG импорт из UI проверен в Electron: новый слой
виден до Save, его ассет сохраняется в `.igs` и открывается снова; отмена и
некорректный файл не меняют документ. При этом тест запускает development
`derivatives-only` worker. JPG/WebP покрыты нормализацией в worker tests, но не
отдельными UI-прогонами. Save с development worker создаёт embedded PNG/WebP
preview из видимых Raster Layers; Electron smoke проверяет повторное чтение
`.igs`, world-space rect и реальные пиксели обоих превью. При ошибке worker
Save сохраняет слои с обозначенным placeholder. Raster-only finite target
теперь строится из frozen bbox и видимых слоёв отдельной worker-командой,
без принятия результата или изменения `.igs`. [Qualified target transport](./engineering/phase-2b-inference-target-composition.md)
теперь даёт этот путь в том же inference child с shared проверкой реального PNG,
ICC, bbox и alpha mode. Интеграция реального ProjectService проверяет frozen
input без изменения документа; transport peer и Python compositor проверены
отдельно. Это пока не пользовательская генерация или proof CUDA readiness. В production Project можно редактировать обычный текст позитивного
и негативного prompt, политику Seed, значение Fixed seed, явную пару
sampler/scheduler, Steps и CFG scale
как часть `generationDraft`. [Dynamic settings/preview](./engineering/phase-2b-dynamic-preview-research.md)
добавляет `maxPrompts` и seed behavior с Undo/Redo, recovery shadow и Save/reopen.
Для старого документа отсутствие settings сохраняется; effective-default no-op
не создаёт dirty/Undo. Сам preview не меняет draft, actual seed или `.igs`. Эти правки принадлежат документу и проходят через
dirty/shadow/явный Save; они не устанавливают фактический seed для `Reuse`.
[Seed Reuse checkpoint](./engineering/phase-2b-seed-reuse-research.md) отдельно
проверяет фактический cursor для открытого `documentId` и переносимый snapshot
только после явного Save. Значение `0` сохраняется корректно; Save не создаёт
редактирование или Undo step. [Production Generate actions](./engineering/phase-2b-generate-actions-research.md) теперь используют retained capture и typed queue/cancel; transient count/status и bbox guard не изменяют документ или Save. Полный inference pipeline остаётся открытым.
Electron smoke проверяет немедленный Save→`.igs`→reopen и native `app.quit()` с
Save сразу после ввода prompt и CFG. Некорректные Fixed seed, Steps или CFG
блокируют Save; при потере фокуса поле возвращается к последнему валидному
значению draft.
Project также сохраняет точную выбранную версию установленного checkpoint и
не заменяет её при смене Default. После копирования `.igs` на другой компьютер
Project предлагает явно связать сохранённую версию с точным установленным
CivitAI-файлом. Проверка идентичности файла выполняется в main; меняются только
локальные ID, и результат проходит dirty/shadow/явный Save. Открытие проекта
само по себе ссылку не меняет.
LoRA stack также проходит dirty/shadow/Save/reopen: версии не заменяются при
смене Default или исчезновении файла; правки веса/enabled и удаление сохраняют
prompt и embedding refs. Явный relink после переноса `.igs` меняет только локальные
ID LoRA, отвергает повреждённый файл и устаревший ответ после правки/закрытия.
LoRA completion вставляет обычный текст: Electron Save и настоящий `.igs` loader
проверяют результат без LoRA ownership или новых embedding refs.
[Проверки prompt](./engineering/project-lora-prompt-research.md).
[Редактирование prompt](./engineering/project-prompt-actions-research.md) проверено
через pointer/keyboard и Save: phrase selection, attention и Copy/Clear работают
в Electron. Project prompt теперь использует общий Project Undo/Redo с одним
шагом на сеанс focus→blur; история не переживает закрытие проекта и не
восстанавливает удалённые embedding refs. Generation pipeline от этих authoring
actions не становится готовым.
[Проверки LoRA](./engineering/phase-2a-project-storage-research.md#project-lora-stack-validation)
не доказывают её загрузку и применение в ML pipeline.
Не готовы полный generation pipeline и composite export, устанавливаемый
Linux/NVIDIA runtime и принятие Smart Patch variants. Явный Add Raster для
проверенных восстановленных результатов теперь проходит recovery shadow и
последующий Save в переносимый `.igs`; см.
[Raster acceptance](./engineering/phase-2b-raster-acceptance-research.md). Локальное
[восстановление и read-only preview](./engineering/phase-2b-results-recovery-ui.md)
из staging repository теперь подключены к Project UI; отдельный
[Save Candidate Image](./engineering/phase-2b-candidate-image-export.md)
сохраняет его проверенный PNG без изменения `.igs`.
Electron удерживает одну восстановленную queue/staging пару; [проверки](./engineering/phase-2b-owned-dispatch-and-recovery.md)
на том checkpoint не покрывали Project close/discard или acceptance; [следующий checkpoint](./engineering/phase-2b-electron-shutdown.md#per-project-close-extension-проверенный-checkpoint) проверяет close/discard, а текущий Add — отдельный acceptance checkpoint. Live self-test app-owned runtime
проверен как внутренняя граница, но без
проверенного release artifact и installer он не доказывает готовую установку.
[Native app close](./engineering/phase-2b-electron-shutdown.md) теперь отменяет
ожидающие jobs до закрытия SQLite; Project показывает проверенные recovered
results до явного закрытия с discard.
Home загружает
подписанные thumbnails из проверенного `.igs` или пересобираемого cache.
Clean Rebuild Preview проверен
через UI→IPC→development worker→`.igs`: исходный документ и ассеты остаются
неизменными, а worker failure сохраняет прежний пакет.

### Обещание

Проект ImageGen Studio — переносимый `.igs`-файл пользователя. Приложение явно
показывает несохранённые изменения и помогает восстановить рабочий документ и
завершённые непринятые результаты после сбоя из локального хранилища приложения,
не подменяя сохранённую версию скрытым состоянием.

### Пользовательская выгода

Пользователь знает, где хранится его работа, может перенести проект и отличает
сохранённую версию от текущих изменений и предложенной recovery-копии.

### Явное не-обещание

- Cloud sync, совместное редактирование или замена внешнего backup.
- Абсолютная защита от потерь при повреждении диска либо любого сбоя.
- Перенос незавершённой работы на другую машину до явного Save или непринятых
  результатов вместе с `.igs`: они остаются в локальном staging даже после
  Save и попадают в переносимый проект только после принятия и последующего
  Save.
- Восстановление undo history после restart.
- Встраивание model weights в каждый проект или запуск на другой машине без
  необходимых ресурсов.

### Supporting contract

[Queue Manager](./engineering/phase-2b-queue-manager-research.md) хранит и очищает
operational history отдельно от `.igs`, staging и фактического seed. Retry
проверяет открытый исходный документ, а close ждёт его admission gate.
[Миниатюры Results](./engineering/phase-2b-result-thumbnails-research.md) теперь
хранятся отдельно от authoritative PNG/receipt и `.igs`; повреждение кэша не
препятствует recovery, просмотру полного PNG, export или явному Add.

[PP-007 Supporting Contract: Project Document Lifecycle](./features/project/document-lifecycle.md)
определяет Save, dirty state, close guards, shadow autosave и recovery.
[Home](./features/home-screen.md) определяет workspace import, relink и Trash,
а [Data Storage](./specs/03-data-storage.md) — пакет `.igs` и derived indexes.
Переносимость проекта не подразумевает готовый Save As flow или preset export.

## PP-008: Генерация меняет проект только по явному решению

**Продуктовый статус:** принято как обязательный MVP scope.

**Публичный статус:** пока не обещать как полностью готовый flow.
[Results recovery view](./engineering/phase-2b-results-recovery-ui.md) и
[Save Candidate Image](./engineering/phase-2b-candidate-image-export.md)
позволяют просмотреть и отдельно сохранить проверенный временный PNG.
[Явный Add Raster](./engineering/phase-2b-raster-acceptance-research.md) теперь
добавляет выбранные завершённые результаты в Project одной document-операцией,
сохраняет recovery shadow до удаления staging и оставляет основной `.igs`
неизменным до Save. Перед удалением невыбранных результатов показывает их число
и требует подтверждения; устаревший набор результатов отклоняется. После
crash/reopen принятое изображение и provenance
восстанавливаются. У результата от другого документа при том же пути Add
недоступен, но preview/export остаются.

[Ранний Add](./engineering/phase-2b-early-raster-acceptance.md) показывает число
незавершённых sibling jobs и невыбранных candidates, подтверждает оба точных
набора и ждёт выхода worker перед принятием. Новое завершение во время отмены
требует повторного подтверждения и остаётся в recovery; другие сессии, Projects
и документы при том же пути не отменяются. После успешного Add admission может
возобновиться; неподтверждённый выход worker сохраняет fence до явного retry.
[Внутренний `enqueueBatch`](./engineering/phase-2b-batch-grouping-research.md)
теперь принимает ordered list уже qualified concrete Illustrious jobs одного
frozen snapshot и создаёт общий batch/session. Все input files синхронизируются
до единой SQLite-транзакции; capacity и отсутствие ранее использованной сессии
проверяются до публикации. 64 candidates, 128 KiB payload и 8 MiB escaped manifest
— существующие storage ceilings, а не измеренный пользовательский batch cap.
Integration test создаёт shared membership через этот entry point, завершает
один job, принимает его с отменой siblings и сохраняет в `.igs`.
[Prepared batch planning](./engineering/phase-2b-batch-planning-research.md)
теперь раскрывает concrete prompt pairs от одной frozen preparation, сохраняет
порядок и uint32 seed schedule, проверяет каждый varied request и возвращает
явную информацию о `maxPrompts` truncation. Fixed/Random/Reuse база уже разрешена
Prepare; один Random выбор и completed Reuse seed `0` проверены отдельно.
Выбранный seed behavior переносится в immutable provenance через Add/Save;
legacy results без этого поля остаются unspecified. Persistent-storage harness
выполнил 47 matrix cases и 4 targeted cases: 46 completed, 5 ожидаемых preflight
refusals, 0 errors. Начальный prepared-batch cap — 32 jobs с независимым byte
preflight; это замер на одном Linux-компьютере без GPU inference.
[Production dynamic preview](./engineering/phase-2b-dynamic-preview-research.md)
теперь открывается из обеих prompt toolbar, использует тот же cap32 planner
с одной iteration и показывает ошибки/явное truncation. Настройки принадлежат
draft и сохраняются через Undo/shadow/Save; открытие preview не запускает jobs
и не выбирает фактический seed. Native Save/reopen проверен; сам preview не доказывает model/transport qualification. Пользовательский Generate подключается отдельным checkpoint ниже.
[Qualified target transport](./engineering/phase-2b-inference-target-composition.md)
добавляет подготовку Canvas к тому же inference child и общему target verifier.
Composition/generation имеют одного serial владельца, ID/type correlation и
confirmed close; повреждённые PNG/ICC/rect/mode не принимаются. Transport tests
запускают настоящий child с подставным peer, Python tests — реальный compositor;
это не новый GPU smoke и не release installer.
[Production Generate actions](./engineering/phase-2b-generate-actions-research.md) теперь подключают fixed bar/images-per-click к frozen batch и автоматическому serial drain. Queue badge/panel показывают actual pending/running rows; current Cancel проверяет document/job ID и ждёт worker exit. Keep/Escape отменяет Generate. Exact Discard+Generate сначала публикует новый batch, затем очищает только подтверждённые старые сессии; known queue отказ сохраняет PNG, uncertain cleanup отменяет новые jobs и удерживает fence. Generate не принимает результат и не меняет `.igs`.
Полный контракт ещё не выполнен: Smart Patch variants и полный pipeline не подключены; runtime installer отсутствует, новые батчи во время busy inference пока недоступны.
`enqueueOne` и Retry продолжают создавать независимые сессии.
Принятие нескольких Raster результатов можно отменить и повторить одним Project
Undo/Redo без возврата временного staging.
[Acceptance journal](./engineering/phase-2b-acceptance-journal-research.md) сохраняет
точный набор сессий перед Add. После сбоя cleanup требует подтверждённого
immutable layer/asset/provenance и synced shadow или проверенного `.igs`,
затем фиксирует tombstones исходных выбранных и невыбранных сессий и завершение
журнала одной SQLite-транзакцией; файлы очищаются после неё. Более новые сессии
и другой документ по тому же пути сохраняются. Без доказанного принятия кандидаты не удаляются;
старые операции без journal остаются под консервативным recovery-правилом.
Generate IPC подключён в указанном узком срезе; release inference pipeline остаётся открытым.
[Queue history lifecycle](./engineering/phase-2b-queue-history-research.md) добавляет
внутренний frozen retry и очистку terminal jobs без удаления completed candidates;
[Queue Manager actions](./engineering/phase-2b-queue-manager-research.md) теперь
подключают global history, reviewed Cancel, frozen Retry с проверкой текущего
document identity и confirmed terminal Delete/Clear. Очистка сохраняет candidate
PNG/manifest и actual-seed cursor; GPU/release pipeline ещё открыты. [Denoising progress](./engineering/phase-2b-generation-progress-research.md) подключён отдельными typed events: реальные шаги worker видны в Project и Queue Manager, счётчик не меняет durable state и очищается при Cancel/settlement.
[Миниатюры Results](./engineering/phase-2b-result-thumbnails-research.md) создаются
тем же inference child и передаются через проверенный подписанный WEBP cache.
Отсутствующий или повреждённый кэш даёт плейсхолдер; full PNG, recovery/export,
selection/Add, seed и `.igs` сохраняют свои границы. Native cached/placeholder
states и semantic mutations проверены; автоматический rebuild, Queue Manager
previews и output/session navigation ещё не реализованы. Публичный статус
PP-008 не повышается: полный MVP pipeline остаётся открытым.
[Seed Reuse checkpoint](./engineering/phase-2b-seed-reuse-research.md) теперь
подключает document-scoped completed cursor к внутреннему Prepare/enqueue,
отображает его в Project и переносит snapshot в `.igs` только при Save;
renderer Generate использует этот cursor и bounded planning; admission во время GPU busy и полный production flow scheduling остаются открытыми.

[Исправления аудита](./engineering/product-audit-fixes.md) подтверждают Add
результата с допустимым actual seed, отличным от planned seed, и его portable
Save. Подмена seed в staging manifest без durable receipt отклоняется без
изменения документа и удаления PNG.

### Обещание

Завершённая генерация не изменяет проект автоматически. Готовые непринятые
результаты сохраняются локально для восстановления после сбоя. Пользователь
сначала просматривает их и явно выбирает, какие станут слоями или вариантами;
принятое изменение можно отменить.

### Пользовательская выгода

Можно экспериментировать и сравнивать варианты, сохраняя контроль над тем,
что попадёт в текущую работу.

### Явное не-обещание

- Бессрочная история всех непринятых или явно отброшенных candidates и
  восстановление после любого повреждения диска.
- Восстановление staging session при Undo принятия результата.
- Undo очереди, выполнения worker или удаления temporary candidates.
- Автоматическое принятие или запись всех результатов в основной `.igs`.

Окончание staging с потерей невыбранных результатов или отменой оставшихся
jobs должно быть объяснено до подтверждения.

### Supporting contract

[PP-008 Supporting Contract: GenerationResults And Staging](./features/project/generate-mode/generation-results.md)
определяет preview, multi-selection, acceptance и cleanup.
[Queue Manager](./features/queue-manager.md#frozen-job-rule) сохраняет frozen job
независимо от дальнейших edits; [Undo/Redo](./features/project/undo-redo.md)
определяет один undo step на acceptance и границы session history.
Provenance принятого результата регулируется PP-005.

## Карта покрытия и открытые границы

| Область продукта                                                       | Опорные promises / решение                                                                        |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Home, tabs, managers, navigation                                       | PP-001, PP-002, PP-003                                                                            |
| Project files, Save, recovery, Trash                                   | PP-007; PP-001 для переключений                                                                   |
| Model install, metadata, versions, missing resources                   | PP-004; PP-006 для применения preset                                                              |
| Provenance, settings comparison, preset from result                    | PP-005, PP-006                                                                                    |
| Queue, staging, Raster/Smart Patch acceptance, undo                    | PP-008; PP-007 для сохранения; PP-005 для provenance                                              |
| Prompt, autocomplete, dynamic prompts, canvas tools, Regional Guidance | Features, доказывающие PP-001–PP-006 и PP-008; отдельный promise для каждого control не требуется |
| Local inference, privacy, offline operation                            | Локальный desktop scope принят; отдельные privacy/offline гарантии требуют data-egress contract   |
| Accessibility, performance                                             | Feature-level требования; отдельные общие гарантии требуют измеримых границ и evidence            |
| Upscale, ControlNet, training, plugins                                 | Отложенный scope; не основание для публичного MVP promise                                         |

Новый promise нужен, когда появляется самостоятельное устойчивое ожидание
пользователя, которое не выражается существующими. Это не каталог всех features.
Supporting contract может поддерживать несколько promises, сохраняя одного
владельца точного правила.

## Как добавлять следующие обещания

Новые и постепенно обновляемые записи используют ту же структуру:

- `Обещание` — простое описание пользовательского результата;
- `Пользовательская выгода` — зачем это важно в реальной работе;
- `Явное не-обещание` — broad negative scope и граница ожиданий;
- `Supporting contract` — отдельный документ с product, UX, data и architecture
  decisions, prototype gaps и проверяемыми инвариантами;
- `Публичный статус` — `можно обещать`, `обещать аккуратно` или `пока не
обещать`, подтверждённый фактическим состоянием продукта.
- `Допустимые исключения` — узкие случаи, не размывающие обещание.

Если новое решение конфликтует с принятым обещанием, конфликт должен быть
назван явно. Нельзя обойти обещание переименованием сущности: dockable widgets
не перестают быть workbench только потому, что называются modes или presets.
