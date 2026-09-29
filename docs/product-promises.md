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

| ID     | Пользовательский результат                | Продуктовый статус   | Публичный статус | Supporting contract и evidence/gaps                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ------ | ----------------------------------------- | -------------------- | ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PP-001 | Готовый понятный интерфейс                | Принятое направление | Пока не обещать  | [Композиция](./contracts/interface-composition.md), [desktop UI review](./engineering/desktop-ui-layout-review.md): Electron shell, базовый Home/Project и Model Manager; полный Home, preferences и Preset Manager ещё не подключены |
| PP-002 | Понятное намерение controls               | Принятое направление | Пока не обещать  | [Явные действия](./contracts/explicit-intent.md): production Create/Import/Save, install/repair и exact checkpoint явные; [syntax hints](./engineering/project-prompt-diagnostics-research.md) локальны и не меняют текст/Save; Generate/Apply и полный resource handoff отсутствуют |
| PP-003 | Понятные роли и места управления          | Принятое направление | Пока не обещать  | [Ownership](./contracts/canonical-ownership.md): базовые Electron Home/Project и Model Manager подключены; Preset Manager, resource handoff и result history остаются незавершёнными |
| PP-004 | Управляемые модели и версии               | Обязательный MVP     | Пока не обещать  | [Библиотека моделей](./contracts/managed-model-library.md): CivitAI Illustrious/Anima `.safetensors` install/version/repair и custom Anima с закреплёнными Qwen3/VAE проверены в SQLite/filesystem tests; Electron smoke покрывает Model Manager prediction override по SHA-256+size, точный Project checkpoint, LoRA stack и Project → Manager focus; [первый SDXL structural preflight](./engineering/phase-2b-inference-worker-research.md) перед Prepare проверен; полная совместимость/загрузка managed моделей, embedding/VAE selectors и обратный handoff ещё отсутствуют |
| PP-005 | Результат помнит настройки                | Обязательный MVP     | Пока не обещать  | [Provenance](./features/project/generate-mode/generation-provenance.md#vue-prototype-coverage): mock comparison/result-to-preset; Project сохраняет sampler/scheduler draft; [внутренний handoff](./engineering/phase-2b-internal-handoff-and-conditioning.md) связывает frozen Illustrious job с queue/processor/staging на реальных SQLite/filesystem, а отдельный GPU smoke проверяет dual-CLIP conditioning; [Electron shutdown](./engineering/phase-2b-electron-shutdown.md) создаёт внутренний dispatch owner и ждёт worker exit при закрытии; renderer Generate, полный pipeline и accepted provenance/storage ещё не реализованы |
| PP-006 | Настройки сохраняются и переиспользуются  | Обязательный MVP     | Пока не обещать  | [Presets](./features/presets.md#known-pp-006-prototype-gaps): Project diagnostics и сквозной Apply на mocks; resource handoff/persistence не завершены                                                                                                                                                                                                                                                                                                         |
| PP-007 | Пользователь владеет переносимым проектом | Обязательный MVP     | Пока не обещать  | [Document lifecycle](./features/project/document-lifecycle.md) и [Phase 2A evidence](./engineering/phase-2a-project-storage-research.md#production-sampling-draft-controls): Electron с dev worker проверяет Save/reopen, recovery, Move/Copy `.igs`, raster Canvas/controls, PNG import, previews/Home thumbnails/Rebuild, prompts/Seed/Steps/CFG и sampler/scheduler draft, read-only Project prediction display из Model Manager, LoRA stack/relink, [prompt actions](./engineering/project-prompt-actions-research.md), native-close Save; [Electron shutdown](./engineering/phase-2b-electron-shutdown.md) отменяет pending jobs и ждёт worker exit; проверен per-Project close с отменой своих jobs и staging tombstones, а при недоступном storage — явный close с сохранением recovery; [Results recovery view](./engineering/phase-2b-results-recovery-ui.md) проверяет, что Save не включает непринятый кандидат в `.igs`; installer и acceptance UI отсутствуют |
| PP-008 | Результаты принимаются явно               | Обязательный MVP     | Пока не обещать  | [Staging](./features/project/generate-mode/generation-results.md#production-candidate-image-export-checkpoint): mock acceptance, production repository для validated candidate/seed recovery и приватный processor с cancel/late-done guards; [Project → staging handoff](./engineering/phase-2b-internal-handoff-and-conditioning.md) проверен с подставным inference transport и настоящей SQLite/filesystem; [Electron shutdown](./engineering/phase-2b-electron-shutdown.md) отменяет pending jobs при app close; per-Project close/discard проверен SQLite/filesystem и Electron smoke, включая degraded recovery close; [Results recovery view](./engineering/phase-2b-results-recovery-ui.md) проверяет typed IPC, приватный PNG preview, Save/Cancel/discard после crash/restart; [Save Candidate Image](./engineering/phase-2b-candidate-image-export.md) даёт отдельный PNG без принятия/удаления staging; Generate и принятие результата в `.igs` отсутствуют |

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
команды; Generate/Apply и полный resource handoff ещё не подключены. Локальные
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

**Публичный статус:** пока не обещать как готовую возможность — flow сравнения
и создания пресета покрыт прототипом; production provenance/storage не доказаны.
Main подготавливает проверенный контекст одного Illustrious `txt2img`:
точный checkpoint, Project target, prompts, Steps/CFG и фактический Fixed/Random
seed. Production Project также сохраняет явно выбранную пару sampler/scheduler,
без скрытого default. Durable enqueue сохраняет immutable input и SQLite
`pending` row; startup отменяет прежние незавершённые jobs. Candidate repository
может опубликовать проверенный временный output и сохранить фактический seed,
но это не принятый результат и не provenance. Приватный processor связывает
queue с candidate repository через подставной inference transport и проверяет
отмену и выход worker. Отдельный [GPU boundary](./engineering/phase-2b-inference-worker-research.md)
в локальном smoke создаёт provisional PNG через настоящий TS/Python subprocess,
но не подключён к processor в Electron. [Следующий внутренний handoff](./engineering/phase-2b-internal-handoff-and-conditioning.md)
соединяет открытый Project, exact checkpoint, durable queue и staging через
настоящие SQLite и файловую систему с подставным inference transport.
Python GPU smoke отдельно проверил Compel conditioning для обоих CLIP,
взвешенного и длинного prompt. Renderer Generate, полный MVP pipeline и
acceptance пока отсутствуют.
[Следующий внутренний checkpoint](./engineering/phase-2b-owned-dispatch-and-recovery.md)
удерживает recovered queue/staging в Electron и проверяет single-worker dispatch
без пользовательского входа; accepted provenance он не создаёт.
[Electron shutdown](./engineering/phase-2b-electron-shutdown.md) создаёт этого
внутреннего владельца при готовых storage/runtime и ждёт его при закрытии,
но по-прежнему не запускает generation из UI.
Строгий [Illustrious request boundary](./engineering/phase-2b-illustrious-request-research.md)
проверяет выбранный sampler/scheduler, модель и временный target, но текущий
derivatives-only worker отвечает `INFERENCE_UNAVAILABLE`; отдельный dev inference
entrypoint исполняет ограниченный `txt2img` с dual-CLIP conditioning, но без
LoRA, embeddings, regional guidance и advanced options. Принятый результат и его
provenance ещё не создаются.
Единственная редактируемая настройка Illustrious prediction type находится в
Model Manager по точным SHA-256 и размеру, с явно обозначенным `epsilon` по
умолчанию. Project показывает current type read-only, а любой сохранённый `.igs`
non-null или старый `null` служит advisory snapshot. Prepare повторно хеширует
файл, берёт текущий effective type без переписывания `.igs` и фиксирует actual
type в подготовленном job. Смена override до materialization отвергает старую
подготовку; accepted provenance в будущем останется immutable.
Renderer Generate, release inference runtime и создание accepted provenance ещё
не подключены.

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
без принятия результата или изменения `.igs`; это пока не работающая
генерация. В production Project можно редактировать обычный текст позитивного
и негативного prompt, политику Seed, значение Fixed seed, явную пару
sampler/scheduler, Steps и CFG scale
как часть `generationDraft`. Эти правки принадлежат документу и проходят через
dirty/shadow/явный Save; они не устанавливают фактический seed для `Reuse`.
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
через pointer/keyboard и Save: phrase selection, attention, Copy/Clear и local
text Undo/Redo работают в Electron. Это не общий Project undo и не восстановление
удалённых embedding refs; generation pipeline от этих authoring actions не становится готовым.
[Проверки LoRA](./engineering/phase-2a-project-storage-research.md#project-lora-stack-validation)
не доказывают её загрузку и применение в ML pipeline.
Не готовы полный generation pipeline и composite export, устанавливаемый
Linux/NVIDIA runtime и принятие непринятых результатов в Project. Локальное
[восстановление и read-only preview](./engineering/phase-2b-results-recovery-ui.md)
из staging repository теперь подключены к Project UI; отдельный
[Save Candidate Image](./engineering/phase-2b-candidate-image-export.md)
сохраняет его проверенный PNG без изменения `.igs`.
Electron удерживает одну восстановленную queue/staging пару; [проверки](./engineering/phase-2b-owned-dispatch-and-recovery.md)
на том checkpoint не покрывали Project close/discard или acceptance; [следующий checkpoint](./engineering/phase-2b-electron-shutdown.md#per-project-close-extension-проверенный-checkpoint) проверяет close/discard, но не acceptance. Live self-test app-owned runtime
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

[PP-007 Supporting Contract: Project Document Lifecycle](./features/project/document-lifecycle.md)
определяет Save, dirty state, close guards, shadow autosave и recovery.
[Home](./features/home-screen.md) определяет workspace import, relink и Trash,
а [Data Storage](./specs/03-data-storage.md) — пакет `.igs` и derived indexes.
Переносимость проекта не подразумевает готовый Save As flow или preset export.

## PP-008: Генерация меняет проект только по явному решению

**Продуктовый статус:** принято как обязательный MVP scope.

**Публичный статус:** пока не обещать как готовую возможность — acceptance и
undo показаны на in-memory candidates. Main имеет локальный recovery repository
для проверенного кандидата и seed и приватный processor для cancel/completion;
внутренний Project → queue → staging handoff проверен на реальных SQLite/filesystem
с подставным inference transport. Отдельный GPU worker проверен локально, но
запуск job через Electron и acceptance/storage handoff отсутствуют. Project
показывает [recovered results](./engineering/phase-2b-results-recovery-ui.md)
с приватным превью после перезапуска и позволяет
[сохранить проверенный PNG отдельно](./engineering/phase-2b-candidate-image-export.md),
не принимая его в `.igs`; это ещё не пользовательская генерация.
[Внутренний coordinator](./engineering/phase-2b-owned-dispatch-and-recovery.md)
владеет одним worker lease и отменой при shutdown. Electron теперь создаёт его
при готовых storage/runtime и [ждёт при закрытии приложения](./engineering/phase-2b-electron-shutdown.md),
и подтверждённый Project close/discard; Generate IPC по-прежнему отсутствует.

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
