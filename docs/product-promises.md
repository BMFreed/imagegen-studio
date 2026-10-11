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

| ID     | Пользовательский результат                | Продуктовый статус   | Публичный статус | Supporting contract и evidence/gaps                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ------ | ----------------------------------------- | -------------------- | ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PP-001 | Готовый понятный интерфейс                | Принятое направление | Пока не обещать  | [Композиция](./contracts/interface-composition.md), [desktop UI review](./engineering/desktop-ui-layout-review.md): Electron shell, базовый Home/Project и Model Manager; полный Home, preferences и Preset Manager ещё не подключены; [исправления аудита](./engineering/product-audit-fixes.md): standalone Home/Project session mapping проверен                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| PP-002 | Понятное намерение controls               | Принятое направление | Пока не обещать  | [Явные действия](./contracts/explicit-intent.md): production Create/Import/Save, install/repair и exact checkpoint явные; [syntax hints](./engineering/project-prompt-diagnostics-research.md) локальны и не меняют текст/Save; [Generate actions](./engineering/phase-2b-generate-actions-research.md) подключены в узком Illustrious txt2img срезе; Apply и полный resource handoff отсутствуют                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| PP-003 | Понятные роли и места управления          | Принятое направление | Пока не обещать  | [Ownership](./contracts/canonical-ownership.md): базовые Electron Home/Project и Model Manager подключены; Preset Manager и resource handoff остаются незавершёнными; global saved-result browser/navigation подключён отдельным checkpoint; [исправления аудита](./engineering/product-audit-fixes.md): вкладки прототипа сохраняют document ownership [Main-owned LaMa delivery](./engineering/phase-2c-lama-install-research.md): internal exact auxiliary installer and full-artifact engine byte planner; Set up/Install/Repair remain unimplemented. [Public outpaint admission](./engineering/phase-2c-public-outpaint-research.md): Generate/frozen Retry are connected for both families with qualified worker 0.12.0 and exact local LaMa; worker capability flags do not replace local resource verification. Six trained installed development UI completions with the common pinned helper are qualified at 256×256/three steps; local transport substitution does not qualify public setup or signed release. |
| PP-004 | Управляемые модели и версии               | Обязательный MVP     | Пока не обещать  | [Installed image uint32 MAX→0 wrap](./engineering/phase-2c-illustrious-image-seed-wrap-research.md): четыре EPS/V × IMG/normal mixed-alpha OUT; 16 admissions/completions/accepted saved layers,12 Save/reopen packages,8 wholeRGBA matches с отдельными numeric MAX/0 controls и4 same-prompt contrasts. Independent raw readback PASS (8178 checks): immutable configuration/source contexts, cursor/Save snapshots, 11 old tables и43 worker identities сохранены. Main modulo mutation:4 semantic RED,8 neighbors GREEN,12 fresh restored GREEN; 137 focused tests PASS. Только256×256/Normal N3, one pair×two/per-prompt; native1/2/cross-pair/high-bit mutation/quality/fullMVP/release не заявлены. Earlier Reuse/crash evidence remains separate below. Image cap32, Anima image batches, broad formats/quality/release остаются открытыми.                                                                                                                                                                         |
| PP-005 | Результат помнит настройки                | Обязательный MVP     | Пока не обещать  | [Installed image uint32 MAX→0 wrap](./engineering/phase-2c-illustrious-image-seed-wrap-research.md): четыре EPS/V × IMG/normal mixed-alpha OUT; 16 admissions/completions/accepted saved layers,12 Save/reopen packages,8 wholeRGBA matches с отдельными numeric MAX/0 controls и4 same-prompt contrasts. Independent raw readback PASS (8178 checks): immutable configuration/source contexts, cursor/Save snapshots, 11 old tables и43 worker identities сохранены. Main modulo mutation:4 semantic RED,8 neighbors GREEN,12 fresh restored GREEN; 137 focused tests PASS. Только256×256/Normal N3, one pair×two/per-prompt; native1/2/cross-pair/high-bit mutation/quality/fullMVP/release не заявлены. Earlier Reuse/crash evidence remains separate below. Image cap32, Anima image batches, broad formats/quality/release остаются открытыми.                                                                                                                                                                         |
| PP-006 | Настройки сохраняются и переиспользуются  | Обязательный MVP     | Пока не обещать  | [Presets](./features/presets.md#known-pp-006-prototype-gaps): Project diagnostics и сквозной Apply на mocks; resource handoff/persistence не завершены; [Anima mock authoring](./engineering/phase-2c-anima-authoring-research.md): explicit family, native-only sampling and supplied-member Apply; production preset storage remains absent                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| PP-007 | Пользователь владеет переносимым проектом | Обязательный MVP     | Пока не обещать  | [Installed image uint32 MAX→0 wrap](./engineering/phase-2c-illustrious-image-seed-wrap-research.md): четыре EPS/V × IMG/normal mixed-alpha OUT; 16 admissions/completions/accepted saved layers,12 Save/reopen packages,8 wholeRGBA matches с отдельными numeric MAX/0 controls и4 same-prompt contrasts. Independent raw readback PASS (8178 checks): immutable configuration/source contexts, cursor/Save snapshots, 11 old tables и43 worker identities сохранены. Main modulo mutation:4 semantic RED,8 neighbors GREEN,12 fresh restored GREEN; 137 focused tests PASS. Только256×256/Normal N3, one pair×two/per-prompt; native1/2/cross-pair/high-bit mutation/quality/fullMVP/release не заявлены. Earlier Reuse/crash evidence remains separate below. Image cap32, Anima image batches, broad formats/quality/release остаются открытыми.                                                                                                                                                                         |
| PP-008 | Результаты принимаются явно               | Обязательный MVP     | Пока не обещать  | [Installed image uint32 MAX→0 wrap](./engineering/phase-2c-illustrious-image-seed-wrap-research.md): четыре EPS/V × IMG/normal mixed-alpha OUT; 16 admissions/completions/accepted saved layers,12 Save/reopen packages,8 wholeRGBA matches с отдельными numeric MAX/0 controls и4 same-prompt contrasts. Independent raw readback PASS (8178 checks): immutable configuration/source contexts, cursor/Save snapshots, 11 old tables и43 worker identities сохранены. Main modulo mutation:4 semantic RED,8 neighbors GREEN,12 fresh restored GREEN; 137 focused tests PASS. Только256×256/Normal N3, one pair×two/per-prompt; native1/2/cross-pair/high-bit mutation/quality/fullMVP/release не заявлены. Earlier Reuse/crash evidence remains separate below. Image cap32, Anima image batches, broad formats/quality/release остаются открытыми.                                                                                                                                                                         |

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

[Main-owned LaMa delivery](./engineering/phase-2c-lama-install-research.md) закрепляет один общий ресурс в
`appData/inference-resources`, вне checkpoint library, environments и disposable
cache. Worker получает только проверенный локальный файл. Installer и byte planner
пока внутренние: Set up/Install/Repair не подключены, статус PP-003 не повышается.

[Public outpaint admission (07.10.2026)](./engineering/phase-2c-public-outpaint-research.md)
использует этот общий exact local ресурс для Generate/frozen Retry обеих семей;
worker-only capability flags не заменяют verification при admission/dispatch.
Шесть trained installed development UI completions при 256×256/трёх шагах
подтверждают public path и общий helper owner. Fixed Main installer проверен с
genuine local transport substitute и exact reuse, без public network download,
first-setup integration или signed release claims; статус PP-003 не повышается.

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

Текущий подтверждённый [Installed image uint32 MAX→0 wrap](./engineering/phase-2c-illustrious-image-seed-wrap-research.md): четыре EPS/V × IMG/normal mixed-alpha OUT; 16 admissions/completions/accepted saved layers,12 Save/reopen packages,8 wholeRGBA matches с отдельными numeric MAX/0 controls и4 same-prompt contrasts. Independent raw readback PASS (8178 checks): immutable configuration/source contexts, cursor/Save snapshots, 11 old tables и43 worker identities сохранены. Main modulo mutation:4 semantic RED,8 neighbors GREEN,12 fresh restored GREEN; 137 focused tests PASS. Только256×256/Normal N3, one pair×two/per-prompt; native1/2/cross-pair/high-bit mutation/quality/fullMVP/release не заявлены.

Предыдущий подтверждённый [Installed Illustrious/NoobAI image Random → Fixed replay](./engineering/phase-2c-illustrious-image-seed-replay-research.md): Random → numeric Fixed/per-prompt на четырёх EPS/V × common-source IMG/normal mixed-alpha OUT scopes:64 admissions/completions/accepted layers, восемь Save/reopen packages и32 wholeRGBA replay matches. Четыре оригинальных Main crypto picks наблюдены без подмены; policies Random/Fixed, concrete prompts, фактические seeds, LoRA−0.5 и source/conditioning/resources сохранены в accepted provenance (`generationConfiguration` и `layerSourceContext`). Templates/maxPrompts — только pre-admission draft/report; поздние edits остаются отдельно. Independent raw SQLite/ZIP/Pillow readback и43 unchanged installed worker identities подтверждены. Baseline-hook/seedBehavior harness mutations дали1+4 semantic RED с neighboring/fresh restored GREEN; новых trained mutations/crash jobs нет. Только256×256/Normal N3/две observed updates; quality/Invoke trained-pixel parity/fullMVP/release не заявлены. Image Reuse после crash подтверждён отдельным [finite срезом](./engineering/phase-2c-illustrious-image-reuse-crash-research.md):44 admissions/36 completions/8 APP_RESTART/36 accepted saved layers/4 Save-reopen packages,32 Reuse +4 crash wholeRGBA matches. Исходный слой, восстановленный кандидат и cursor B сохранены; setup3/1/2cancel/1accepted-unsaved исключён. Последующий finite [image MAX→0 gate](./engineering/phase-2c-illustrious-image-seed-wrap-research.md) подтвердил16 admissions/completions/accepted saved layers,12 packages и8 own numeric-control wholeRGBA matches; native1/2/cross-pair wrap не заявлены. Следующий отдельный finite cut — image cap32; counts и budgets фиксируются до запуска. Image cap32, dynamic embedding subsets в image modes, Anima image batches, broad formats/geometry/quality/public delivery/release остаются открытыми; PP-004/005/007/008 остаются «Пока не обещать».

Предыдущий подтверждённый [Installed Illustrious/NoobAI per-prompt IMG/OUT](./engineering/phase-2c-illustrious-dynamic-image-per-prompt-research.md): Fixed0/per-prompt, четыре EPS/V × common-source IMG/normal mixed-alpha OUT scopes, четыре weighted positive×negative пары × две iterations, literal seeds0..7; 32 admissions/completions/accepted layers и четыре saved/reopened packages. Восемь first-pair0/1 wholeRGBA references совпали с прежним per-iteration gate; 16 within-pair seed contrasts проверяют только seed effect. Cross-pair prompt causality при разных seeds не заявлена. Concrete prompts, LoRA−0.5 и per-prompt settings остаются frozen в accepted configuration; исходные templates/maxPrompts сохранены в pre-admission draft/report, а не в provenance; поздние green-bowl/grainy prompts, Fixed37/per-iteration, maxPrompts3 и LoRA−0.25 сохраняются отдельно в current draft. Полная OUT source-over композиция проверена; все 43 native worker source identities и application bundles неизменны, старые reports/source hashes сохранены с явной lineage четырёх qualification helpers. Новых trained mutation/crash jobs нет. Executed details и ограничения — в новом research note.

Предыдущий подтверждённый [Installed Illustrious/NoobAI dynamic IMG/OUT](./engineering/phase-2c-illustrious-dynamic-image-research.md): EPS/V common-source IMG/normal mixed-alpha OUT, Fixed0/per-iteration, four weighted positive×negative pairs×2 iterations. Исправленный frozen R2 plan получил independent finite reader PASS (10833 checks): 48 admissions/completions, 40 accepted layers, 8 saved/reopened packages; 4 seed1 numerical RED до Add, 4 seed0 wholeRGBA neighbor GREEN, 8 fresh restored wholeRGBA matches и 48 same-seed prompt contrasts. Четыре OUT previews сохранили soft alpha и 222208 protected-source pixels; restoration всех 43 source identities проверен независимо. Первый исключённый EPS IMG attempt дал 8 admissions/completions/accepted layers и отдельный пакет, но остался failed на неверном all-visible ожидании: Add показывает только выбранный anchor. Qualifier явно показывает остальные variants перед Save; sticky verification failure исправлен только в test harness, production behavior не менялся. Qualified 48/40 отделены от raw 56 completions/48 accepted с первым failed attempt; его пакет не входит в qualified 8. Один control report сохраняет cleanup ENODEV; отдельные source-bound PID/start/cgroup closure supplements подтверждают native/launcher exits, cleanup race не считается numerical RED. Finite gate подтверждён: fresh system proof (820 checks), env/cwd guard sensitivity (точный original refusal, isolated predicate mutation RED, fresh original PASS) и guarded cleanup завершены — R0 9 paths/9117696 allocated B, R2 7 paths/7651328 allocated B; все 43 original source identities сохранены. ENODEV repair применён после original-source reader/cleanup: isolated actual two-file copy дала 30 baseline GREEN, 4 semantic RED/26 neighbor GREEN и 30 fresh restored GREEN; inode/mode/mtime/SHA восстановлены точно, без ML reruns; PP-004/005/007/008 остаются «Пока не обещать». На этом историческом checkpoint image Random/Reuse/wrap/cap32/crash, dynamic embedding subsets в image modes и Anima image batches оставались открытыми; завершённый Random-follow-up описан выше. FullMVP/quality/Invoke trained-pixel parity/public delivery/release не заявлены; PP-004/005/007/008 остаются «Пока не обещать». Этот ранее предложенный Random → Fixed replay теперь подтверждён отдельным [Installed Illustrious/NoobAI image Random → Fixed replay](./engineering/phase-2c-illustrious-image-seed-replay-research.md). Image Reuse после crash подтверждён отдельным [finite срезом](./engineering/phase-2c-illustrious-image-reuse-crash-research.md):44 admissions/36 completions/8 APP_RESTART/36 accepted saved layers/4 Save-reopen packages,32 Reuse +4 crash wholeRGBA matches. Исходный слой, восстановленный кандидат и cursor B сохранены; setup3/1/2cancel/1accepted-unsaved исключён. Последующий finite [image MAX→0 gate](./engineering/phase-2c-illustrious-image-seed-wrap-research.md) подтвердил16 admissions/completions/accepted saved layers,12 packages и8 own numeric-control wholeRGBA matches; native1/2/cross-pair wrap не заявлены. Следующий отдельный finite cut — image cap32; counts и budgets фиксируются до запуска. Image cap32, dynamic embedding subsets в image modes, Anima image batches, broad formats/geometry/quality/public delivery/release остаются открытыми; PP-004/005/007/008 остаются «Пока не обещать».

Предыдущий [Installed NoobAI multiple-LoRA IMG/OUT](./engineering/phase-2c-noobai-lora-stack-image-research.md): EPS/V common-source IMG/normal mixed-alpha OUT:22 admissions/completions,18 accepted Save/reopen/comparisons. Exact configured/effective AB/BA, B-enabled-zero/B-disabled; Digital Art A−0.5/Lineless B+0.75, ordinary unweighted prompts, external VAE FP32. Normal N3/CFG5/Fixed0/strength0.5 даёт2 actual updates. Один EPS resource-weight-swap cycle даёт2 visible-RGB/composite RED до Add,2 disabled-neighbor fullRGBA GREEN и2 fresh restored;4 provisional controls/0 mutant acceptance. В четырёх healthy objective/mode scopes zero и disabled совпадают в completeRGBA; nonzero B меняет visible output, без требования AB/BA pixel inequality. Четыре bounded native probes проверяют16 captured ordered stack handoffs и24 independent low-rank algebra variants,без дополнительных image jobs. Independent raw SQLite/ZIP/full source-over preview,43 original source identities и final physical idle PASS. Только256×256 и declared sources/grids; installed V weight-swap pixel causality не заявлена. Historical Karras TXT wrong-EPS pixel RED остаётся gap. FullMVP/quality/Invoke trained-pixel parity/public delivery/release не заявлены. На этом multiple-LoRA checkpoint dynamic common-source IMG/normal OUT ещё был открыт; текущая qualification описана отдельно. Broad formats/quality/release остаются gap.

Предыдущий [Installed NoobAI signed embedding IMG/OUT](./engineering/phase-2c-noobai-embedding-image-polarity-research.md): EPS/V common-source IMG/normal mixed-alpha OUT:18 admissions/completions,13 accepted Save/reopen/comparisons. Normal N3/CFG5/Fixed0/strength0.5 даёт2 actual updates; exact trained/zero versions в обеих полярностях. Один EPS signed-resource-swap cycle даёт4 directional visible-RGB/composite RED: mutant fullRGBA совпадает с противоположным healthy; ordinary EPS IMG neighbor fullRGBA GREEN,4 fresh restored,5 provisional controls/0 mutant acceptance. Четыре bounded native probes дают16 independent assignments и128 hidden/pooled tensor+handoff matches, branch isolation,0 extra image jobs. Independent raw SQLite/ZIP/full source-over preview,43 original source identities и final physical idle PASS. Только256×256, one literal per polarity,Digital Art−0.5/externalVAE FP32/declared sources; V sign-swap pixel causality не заявлена. Historical Karras TXT wrong-EPS pixel RED остаётся gap. FullMVP/quality/Invoke trained-pixel parity/public delivery/release не заявлены. Последующий multiple-LoRA image checkpoint описан отдельно.

Предыдущий [Installed NoobAI V DPM++ 2M IMG/OUT](./engineering/phase-2c-noobai-vpred-dpm-image-research.md): V/true-ZTSNR/leading Normal/Karras common-source IMG/normal OUT:16 admissions/completions,10 accepted Save/reopen/comparisons. N4 оставляет2 neighbor/3 history updates; один history-reset cycle даёт4 visible-RGB/composite RED,2 fullRGBA GREEN,4 fresh restored,0 mutant acceptance. Independent raw SQLite/ZIP/full source-over preview,43 original source identities и final physical idle PASS. Только256×256/N4/CFG4/Fixed0/LoRA−0.5/externalVAE FP32/declared cutoffs; historical Karras TXT wrong-EPS pixel RED остаётся gap. FullMVP/quality/Invoke trained-pixel parity/public delivery/release не заявлены. Последующий signed embedding image checkpoint описан отдельно.

Предыдущий [Installed NoobAI V DPM++ 2M TXT](./engineering/phase-2c-noobai-vpred-dpm-research.md): Normal/Karras при true-ZTSNR/leading. 8 actual admissions, 7 completions, 5 accepted saved/reopened packages и owning comparisons; Normal wrong-EPS даёт pixel RED до Add, EPS neighbor сохраняет pixels. Karras wrong-EPS отказал до candidate; отдельный bounded replay воспроизвёл UNet NaN, но исходный traceback утрачен и Karras pixel RED не доказан. Оба fresh V restored воспроизводят completeRGBA; два protected cycles восстанавливают43 source bytes/identities, 0 mutant acceptance, independent raw aggregate и final physical idle подтверждены. Только256×256/N4/CFG4/Fixed0/LoRA−0.5/externalVAE FP32. First baseline combined peak/launcher exit неизвестны; остальные семь cases measured. FullMVP/quality/Invoke trained-pixel parity/public delivery/release не заявлены. Последующий bounded IMG/OUT срез описан отдельно.

Предыдущий [Installed five-sampler campaign](./engineering/phase-2c-sampler-campaign-research.md): Anima DPM++ 2M SDE/ER-SDE/LCM IMG/OUT и EPS Illustrious-family DPM++ 2M/SDE Normal/Karras TXT/IMG/OUT. 68 finite admissions/completions, 43 accepted saved/reopened packages и owning comparisons; 25 provisional controls дают18 numerical RED до Add и7 неизменённых neighbor GREEN, 0 mutant acceptance. Все18 fresh restored cases воспроизводят completeRGBA; 14 accepted OUT packages сохраняют contribution alpha, source и полный независимый merged preview. Все пять mutations восстанавливают43 installed source bytes/identities; independent aggregate 19102 checks и final physical exit подтверждены. Только256×256/CFG4/Fixed0/LoRA−0.5 и declared finite grids. FullMVP/public statuses/quality/release остаются открытыми. На этом campaign V DPM++ 2M profile interaction ещё был открыт; последующий bounded TXT срез описан отдельно.

Предыдущий [Installed Anima DPM++ 2M IMG/OUT](./engineering/phase-2c-anima-dpmpp2m-image-research.md): 8 admissions/completions, 5 accepted saved/reopened packages и owning comparisons, с отдельным неизменённым source layer. При authored4 neighbor IMG strength0.5 выполняет2 first-order updates; history IMG/OUT strength0.75 —3 updates с second-order history. Installed history reset: neighbor IMG pixels GREEN, history IMG/OUT RGB RED до Add (alpha неизменна; IMG 65395 / OUT 25794 видимых changed pixels), 0 mutant accepted. Exact43-file bytes/identity restoration и fresh IMG/OUT fullRGBA replay; independent aggregate 2753 checks, полный affine/source-over preview. Только256×256/CFG4/Fixed0/Myth−0.5; fullMVP/release status неизменен. На этом DPM++ 2M checkpoint следующий SDE IMG/OUT gate ещё был открыт; позднейший five-sampler campaign закрывает выбранные finite cases.

Предыдущий [Installed Anima Heun IMG/OUT](./engineering/phase-2c-anima-heun-image-research.md): 5 admissions/completions, 3 accepted saved/reopened packages и owning comparisons, отдельный неизменённый source layer в каждом. Heun4/strength0.5 даёт3 evaluations. Installed premature-mask mutation: IMG pixels GREEN / OUT visible RGB RED до Add (alpha неизменна, 25819 изменённых видимых пикселей), 0 mutant accepted. Exact43-file restoration и fresh OUT rawRGBA replay, independent aggregate 2578 checks; полный affine/source-over preview проверен. Только256×256/CFG4/Fixed0/Myth−0.5, fullMVP/release status неизменен. На этом Heun checkpoint DPM++ 2M IMG/OUT ещё был открыт; его завершённый follow-up записан выше.

Предыдущий [installed Anima ER-SDE order3 checkpoint](./engineering/phase-2c-anima-er-sde-order3-research.md)
подтвердил five-step TXT и three-step neighboring control: 5 admissions и
5 finite completions, 3 accepted saved/reopened packages и owning comparisons.
Отключение только installed dd_x0 correction сохраняет three-step pixels и
меняет five-step pixels до Add; оба controls имеют 0 accepted layers.
Восстановлены все 43 исходных bytes/inode/mode/mtime; fresh five-step результат
совпал по пикселям. Independent raw aggregate: 1750 checks, PASS. Прежняя попытка
с ошибкой cleanup учтена отдельно: +3 admissions/completions и +2 accepted
packages; raw totals8/8/5/5. Граница — TXT256/CFG4/Fixed0/Myth−0.5;
PP-004/005/007/008 сохраняют «Пока не обещать». Heun IMG/OUT был следующим gate на этом checkpoint; он завершён в follow-up выше. Остальные image modes, полный
policy/geometry/format/quality и release остаются открытыми.

Последний [installed cap32/bounded truncation checkpoint](./engineering/phase-2c-generation-batch-cap-research.md)
проверил Anima и точные Illustrious-family EPS/V: четыре weighted positive×negative
пары × восемь iterations, Fixed0/per-iteration дают 32 native outputs без truncation;
первые три пары × две iterations, Fixed0/per-prompt дают 6 outputs с явным truncation.
Independent aggregate PASS: 114 admissions/114 finite/114 accepted saved layers,
6 accepted saved/reopened packages и 114 per-layer comparisons; все 18 selected-prefix
outputs совпали по same-input pixels с boundary indices 0,1,10,11,20,21.
Три настоящих confirmed 33-job UI refusals сохранили все 32 temporary results
и captured queue/receipts/cursor/staging/Project DTO/private shadow/saved package.
Проверены Undo/Redo availability flags; внутренний Undo stack не снимался.
Пять actual-source mutations: 204 executed tests/22 semantic failures, baseline
и fresh restored по 52/52 GREEN, 0 skipped; focused 349/349/typecheck/build GREEN.
Граница — TXT 256×256/три steps; полный policy/mode matrix, non-Euler IMG/OUT,
форматы/геометрия/качество/public delivery/release и full MVP остаются открытыми.
На этом checkpoint ER-SDE order3 ещё оставался открытым; bounded follow-up описан выше.
Статус «Пока не обещать» сохранён; прежние counts ниже относятся к своим checkpoint.

Предыдущий [installed Random/uint32 seed checkpoint](./engineering/phase-2c-generation-seed-boundary-research.md)
проверил Anima и точные Illustrious-family EPS/V через настоящие renderer/Main,
installed worker 0.14, Add/Save/readback/reopen и 42 сравнения принятых слоёв. Для
каждого objective наблюдался один оригинальный Main cryptographic Random base;
Fixed numeric replay воспроизвёл same-input pixels, per-prompt wrap дал MAX/0/1/2,
а fresh MAX/0 после exact restoration воспроизвёл healthy wrap pixels. Три
installed high-bit RNG mutations дали pixel RED до Add/0 accepted mutant layers.
Поздние queue строки не служили источником ожидаемых seeds; requested policy,
actual seed и selected behavior сохранились в portable provenance после current
prompt/sampler/seed 37/LoRA/dynamic edits.

Independent raw SQLite/ZIP/Pillow aggregate PASS (15,006 checks): 54 qualified admissions,
45 finite outputs (36 normal, 3 provisional mutant, 6 fresh), 42 accepted saved layers
в 12 reopened packages и 9 APP_RESTART. Raw 58 admissions/49 outputs/46 saved layers/
13 packages/9 cancellations отдельно включают прежний healthy EPS Random 4/4/4/1,
не входящий в uniform current-source matrix. Два исключённых setup 0/0 не являются
semantic RED. Original 302 queue rows/186 cursors/249 receipts, catalog 9/14/defaults,
восемь original sources и 43 restored worker source/assets сохранены; final physical
idleness подтверждён. Full MVP/readiness этим не закрыты. На этом прежнем срезе следующим gate был
cap 32/bounded truncation; bounded follow-up приведён выше; полный policy/mode matrix, replacement-document identity,
форматы/геометрия/качество/public delivery/release остаются открытыми.
Статус «Пока не обещать» сохранён.

Предыдущий [installed dynamic embedding checkpoint](./engineering/phase-2c-illustrious-dynamic-embeddings-research.md)
(09.10.2026) проверил full authored refs/effective native subsets у EPS/V:
ordinary, negative-only, positive-only, both. Независимый raw aggregate:
20 qualified admissions/16 completions/4 APP_RESTART,4 saved packages/12 layers;
raw24/16/8 включает отдельный resource-stop с4 jobs/0 outputs. Обе negative-vector
mutations дали numerical RED до Add при GREEN ordinary, fresh4 восстановили
pixels. Actual completion остаётся temporary до Add; Save/reopen/12 comparisons
сохраняют concrete refs и snapshot0 при удалённых live sidecars. Catalog9/14,
prior278 queue rows/source43 сохранены; новый Anima ML run не выполнен.
На этом historical checkpoint Random/uint32 оставались открытыми; отдельный
seed follow-up описан выше. Broader caps/seed-policy combinations,
formats/quality/public delivery/release и полный MVP остаются открытыми. Статус «Пока не обещать» сохранён.

Предыдущий [installed Illustrious/NoobAI dynamic checkpoint](./engineering/phase-2c-illustrious-dynamic-batch-research.md)
(09.10.2026) проверил exact EPS/V, Fixed0/per-iteration и crash-recovered local
Reuse0/per-prompt через renderer/Main/installed worker0.14 и явный Add/Save/reopen.
Независимый raw SQLite/ZIP/Pillow aggregate:58 admissions/42 completions/16
APP_RESTART,6 saved packages/38 accepted layers; один исключённый0-job selector
setup учтён отдельно. Обе generation-RNG seed-alias mutations дали causal pixel
RED до Add (4 provisional/0 accepted), после restoration —4 fresh GREEN.
Catalog9/14/defaults/prior220 queue rows и43 source/assets сохранены, physical idle
подтверждён. Новый Anima ML run этим срезом не выполнен. Его прежний gap
Random/uint32 закрыт в bounded seed follow-up выше; max32/truncation/full
Fixed-per-prompt matrix/formats/quality/public delivery/release и полный MVP
остаются открытыми. Статус «Пока не обещать» сохранён.

Предыдущий [installed Anima dynamic-batch checkpoint](./engineering/phase-2c-anima-dynamic-batch-research.md)
(09.10.2026) проверил actual positive×negative expansion, Fixed0/per-iteration8
и recovered local Reuse0/per-prompt8. Настоящий crash сохранил completed candidate0
и local cursor0 при null portable snapshot; два unfinished jobs получили
APP_RESTART. Frozen prompts/method/weights/seeds пережили current draft edits.
Normal17 completions/19 admissions, semantic noise-seed-alias2 provisional outputs
с pixel RED до Add/0 accepted и fresh restored2 GREEN дают три saved/reopened
packages/19 accepted layers со snapshots1,7,1. Независимый raw SQLite/ZIP/Pillow
aggregate отделяет29 qualified admissions от40 raw attempts и одного excluded
accepted unsaved shadow. Catalog9/14/defaults сохранён, все43 source/assets
восстановлены, physical idleness подтверждён. Illustrious/NoobAI counterpart
и отдельный seed follow-up записаны выше. Max32 native/truncation/formats/quality/
public installer/release и полный MVP остаются открытыми. Статус «Пока не обещать» сохранён.

Предыдущий [Installed Anima worker0.14 regression](./engineering/phase-2c-anima-worker-014-regression-research.md) (08.10.2026)
проверил 8 normal finite полных UI cycles в 9 admissions с одним actual Cancel:
шесть native TXT methods, Euler opaque IMG и mixed-alpha OUT через frozen Retry.
Bounded settings — 256×256, три requested steps, CFG4, fixed seed0, обычная
Myth Portrait LoRA−0.5, positive weight1.3 и negative0.7. Captured bundle, native
method, weighted prompts и signed LoRA остаются frozen после current prompt/
method/seed37/weight−0.25 edits; explicit Add/Save/readback/reopen и read-only
comparison сохраняют exact portable configuration и pixels. Heun TXT выполняет
пять evaluations; Euler IMG/OUT strength0.5 — два.

Installed token-weight omission сохранила correct frozen inputs и дала один
finite provisional completed candidate, затем same-input pixel RED до Add:
0 accepted mutant layers/0 saved mutant cycles. Raw native cleanup превысил
свой deadline. Protected restoration независимо проверила physical idle
и восстановила все43 original worker sources; поздний bounded proof отдельно
подтвердил exit с сохранением исходных cleanup errors. Fresh Euler TXT/IMG/OUT3 полных
cycles воспроизводят healthy same-choice pixels. Всего подтверждены11 saved/
reopened accepted packages и13 new admissions; candidate mutation не добавляется
к accepted count. Catalog9 resources/14 versions сохраняет prior6/10/defaults:
четыре managed files приняты в отдельном initial0-job UI setup, добавлены только
три owners и Anima version существующего Cyberfalafel CivitAI resource.

На этом историческом checkpoint dynamic multi-job/seed/crash Reuse оставались
открытыми; следующий bounded Anima checkpoint записан выше. Non-Euler IMG/OUT, ER-SDE order3, arbitrary formats,
качество/Invoke author recipe/public delivery/release и полный MVP этим bounded
срезом не квалифицированы; статус «Пока не обещать» сохранён. Предыдущие checkpoint
counts и historical limits ниже не расширяются.

Отдельный [installed multiple-LoRA UI checkpoint](./engineering/phase-2c-noobai-lora-stack-ui-research.md)
подтвердил 8 normal EPS/V TXT cycles в 8 admissions: AB, BA, B-enabled-zero и
B-disabled на objective, 256×256/три steps/seed0, native external VAE/FP32.
Exact Digital Art−0.5/Lineless+0.75 выбираются через настоящий UI; remove/re-add
задаёт порядок без отдельного reorder control. Полный configured stack и ordered
enabled subset остаются frozen после live reorder/weight edits. Explicit Add и
Save/readback/reopen сохраняют exact portable identities, порядок, enabled/weight
и текущий draft. UI comparison проверяет ordered name/version/SHA/enabled/weight;
CivitAI IDs независимо проверены в portable provenance, без утверждения о проверке
каждого rendered description field. B-zero и B-disabled дают одинаковые pixels;
AB и BA отличаются от этих controls, без требования pixel relation между AB/BA.
Strict catalog6/10 сохраняет исходные девять versions: единственная adoption
171,540,060-byte Lineless выполнена в отдельном setup; normal и fresh runs добавили
0 managed files. Installed weight-swap дал causal same-input pixel RED на первом
finite AB candidate до Add: 1 provisional completion, 0 accepted layers и
0 полных saved cycles. После physical exit восстановлены43 original inode/mode/
mtime/bytes, backup отсутствует; fresh restored EPS4 GREEN воспроизводит все четыре
healthy same-choice pixels, physical native exit подтверждён. Independent SQLite/
raw ZIP/Pillow aggregate проверил 12 qualified saved cycles/packages (8 normal+
4 fresh), точные receipts/pixels/ordered tuples; 14 total admissions включают ещё
1 provisional mutant и1 excluded saved setup partial. Все prior model/queue rows
сохранены, final Main/worker idle и43 exact sources подтверждены. Предыдущие native
algebra counts остаются отдельными. Этот historical gate предшествует bounded
Anima worker0.14 и bounded dynamic/seed checkpoints выше. Cap32/bounded truncation был открыт на этом срезе; завершённый bounded follow-up приведён выше.
Arbitrary formats/quality/Invoke parity/public delivery/release и статус
«Пока не обещать» не закрыты.

Предыдущий [native multiple-LoRA checkpoint](./engineering/phase-2c-noobai-lora-stack-native-research.md)
подтвердил12 normal EPS/V loader variants/11832 all-target observations на
half-loaded trained checkpoints: exact Digital Art−0.5 и Lineless+0.75, полный
986 targets каждого source и union986 (UNet722/CLIP1 72/CLIP2 192). Independent
source/graph mapping и temporary FP32 CPU module algebra проверяют single/AB/BA/
enabled-zero controls, source→adapter→signed weight binding и unload restoration.
Оба normal PID exits и43 original sources подтверждены. Это0 UI jobs/images/
receipts/conditioning/denoising; catalog5/9 и153 queue rows не пополняются,
source use остаётся local precondition без adoption/download/runtime copies.
Installed weight-swap mutant прошёл2 healthy single variants/1972 observations,
затем дал точный AB numeric RED. После physical child exit восстановлены43
original inode/mode/mtime/bytes, backup отсутствует; fresh EPS6 GREEN/5916
observations воспроизводит normal base SHA. Final proof подтверждает unchanged
полные catalog/queue rows5/9/153 и managed files, Main/worker idle и current
oracle SHA во всех четырёх executions. Additive A/B и B/A совпадают в пределах
FP32 tolerance; immutable stack order по-прежнему recorded setting. Этот native
checkpoint не проверял multiple-LoRA UI→queue→Add/Save/readback/reopen/comparison;
отдельный completed UI follow-up описан выше; historical native counts не расширяются.
Исторические counts и «Пока не обещать» сохранены. На этом native checkpoint
Anima0.14/dynamic/arbitrary formats/quality/Invoke parity/public delivery/release
оставались открытыми; последующий bounded Anima срез описан выше.

Предыдущий installed [embedding polarity срез](./engineering/phase-2c-noobai-embedding-polarity-research.md)
(08.10.2026) прошёл четыре finite normal EPS/V TXT UI cycles в четырёх admissions:
Z/T и T/Z на objective,256×256/три steps/seed0, один literal на sign, exact
trained/zero versions, LoRA−0.5 и native external VAE/FP32. Strict catalog5/9
сохранён без публикации и новых managed files. Три успешных independent native
oracles проверили12 direct hidden/pooled/handoff assignments, не добавляя jobs.
Installed EPS sign-swap завершил два finite UI cycles до causal directional RED,
хотя pixels оставались разными; physical exit/restored43/original inode/mode/mtime/
bytes/backup absence подтверждены, fresh EPS pair2 GREEN. Final evidence связывает
все8 UI cycles с saved packages/Pillow pixels/SQLite receipts и точными signed refs;
mutant pixels равны противоположным normal choices, fresh pixels равны своим.
Подготовленные local sources не доказывают public delivery; arbitrary formats,
arbitrary multiple-LoRA combinations/order, Anima0.14, dynamic, quality/Invoke parity и release открыты.
Предыдущие counts и статус «Пока не обещать» сохранены.

Текущий installed component срез (08.10.2026):
[Installed NoobAI components](./engineering/phase-2c-noobai-component-inference-research.md)
подтверждает 36 finite completions в 36 admissions: оба declared EPS/V recipes,
txt2img, common-source img2img и normal mixed-alpha outpaint, шесть matched
component choices на каждый mode/objective. Один canonical worker0.14 использует
пять resources/eight versions с сохранением исходных checkpoint/LoRA identities.
Проверены enabled/disabled LoRA −0.5, отдельно trained/zero embedding в каждом
sign и healthy native/finite decoder-control/same-weight LDM VAE. Это bounded
256×256/три requested steps. Четыре installed EPS-txt2img component mutations
дали causal RED после шести finite Generate/Add/Save/readback/reopen cases каждая.
Исходник восстановлен между прогонами; fresh restored EPS-txt2img normal прошёл
шесть finite cycles с подтверждённым native physical exit.
Exact local source/catalog preparation не доказывает
public CivitAI delivery или engine Install/Repair. Bounded polarity follow-up
описан выше; multiple-adapter order, Anima на worker0.14, dynamic batches,
Presets и release остаются открытыми. Статус «Пока не обещать» сохранён.

Последующий [bounded VAE encoder checkpoint](./engineering/phase-2c-noobai-vae-encoder-research.md)
завершил 8 finite EPS/V txt2img/strength0.5 img2img cases при256×256/трёх
requested steps. Native и artificial encoder-only control сохраняют decoder/config:
TXT pixels равны, IMG pixels различаются. Catalog5/9 сохраняет исходные восемь
versions; derived source preparation остаётся isolated local precondition,
не public delivery. Installed EPS-img2img encode-zero mutant завершил два full
finite cycles до causal pixel RED; после physical exit восстановлены 43 exact
source files с original inode/mode/mtime. Fresh restored pair прошла два finite GREEN cycles с physical exit.
Outpaint encoder, all-layer/format compatibility, качество и Invoke pixel parity
этим TXT/IMG срезом не квалифицируются; полный MVP по-прежнему не обещается.

Отдельный последующий [outpaint encoder checkpoint](./engineering/phase-2c-noobai-outpaint-encoder-research.md)
подтвердил четыре finite EPS/V normal OUT cycles в четырёх admissions при256×256,
трёх requested steps, FP32, seed0 и strength0.5; native schedule выполняет два
effective denoising evaluations. Две matched пары сохраняют contribution alpha
и protected source, меняя visible generated RGB и saved merged RGB на
соответствующих координатах после Add/Save/readback/reopen/comparison.
Catalog5/9 сохранён без новых managed files; оба native runs завершились с physical exit.
Installed EPS-OUT encode-zero mutant завершил два finite cycles до intended visible-RGB RED;
physical exit и восстановление 43 exact sources с original inode/mode/mtime
подтверждены. Fresh restored pair прошла два finite GREEN cycles с physical exit
и exact original EPS RGBA/merged pixels. Final evidence связывает все восемь OUT
cycles (4 normal +2 finite mutation cycles до causal RED +2 fresh GREEN) с CPU
control descriptors во всех frozen VAE refs и реальными SQLite completed rows/
receipt bytes; independent Pillow saved `.igs` decode подтверждает alpha, protected
source и corresponding visible/merged pixels. Main/worker/nativeData idle; все43
exact sources восстановлены с original inode/mode/mtime/bytes, backup отсутствует.
Это отдельные OUT counts, не расширение прежних 8 TXT/IMG cases; all-layer/formats/quality/Invoke parity,
public delivery и release остаются открытыми. Статус «Пока не обещать» сохранён.

Предшествующий component source/Prepare срез (08.10.2026):
[NoobAI component research](./engineering/phase-2c-noobai-components-research.md).
Exact NoobAI standalone VAE source gate исправлен; controlled HTTP → настоящий installer/SQLite → repair/default/fresh connection/Prepare проверены для LoRA, dual-CLIP embedding и VAE с exact identities и реальными structural qualifiers. Неизвестные labels и generic SDXL checkpoints/LoRA/embeddings по-прежнему отклоняются. Credited local sources отдельно прошли Main preflight; unchanged installed worker0.14 CPU загрузил два полных VAE layouts и проверил finite paired embedding state. Прямой download embedding не является public app installation; trained combinations оставались открытыми на этом source/Prepare checkpoint и проверены последующим bounded installed срезом выше. Anima/new-worker regression и release остаются открытыми. Статус «Пока не обещать» сохранён.

Предшествующий installed NoobAI outpaint checkpoint (07.10.2026):
[Mixed-alpha outpaint qualification](./engineering/phase-2c-noobai-outpaint-research.md)
использует один worker0.14, exact three-resource catalog и pinned LaMa с проверкой
SHA/size через настоящий Main staging/publication при intercepted local transport.
Отдельный source download не доказывает engine first setup или live CivitAI
установку. Оба objectives прошли обычный mixed-alpha путь; Model Manager остаётся
единственным владельцем prediction/ZTSNR/spacing. Component combinations оставались
открытыми на этом checkpoint; последующий bounded срез описан выше. Independent
component gates, new-worker Anima regression, Presets и release остаются открытыми. Статус
«Пока не обещать» сохранён.

Предшествующий installed NoobAI author checkpoint (07.10.2026): [Installed NoobAI author-recipe qualification](./engineering/phase-2c-noobai-author-recipe-research.md)
использует один обновлённый non-editable worker0.14 и exact catalog из Cyberfalafel
v-pred, отдельного официального NoobAI epsilon и ordinary LoRA. Новый epsilon файл
прошёл реальный Main downloader/hash/size/staging с полностью intercepted local
transport и fake token, затем catalog publication; это не live CivitAI delivery
или Add-from-URL UI install. Model Manager остаётся единственным владельцем
prediction/ZTSNR/spacing. Пять trained single-axis controls, отдельные четыре
lifecycle completions и два прогона 832×1216/28 steps описаны с границами reports.
Component combinations и оба NoobAI outpaint objectives оставались открытыми
на этом author checkpoint; последующие bounded checkpoints описаны выше.
Presets и release остаются открытыми. Статус «Пока не обещать» сохранён.

Предшествующий noise-profile срез (07.10.2026):
[exact-file ZTSNR/spacing](./engineering/phase-2c-noise-profile-research.md)
реализованы в Model Manager, Main SQLite policy, frozen execution/Retry и
portable accepted configuration/read-only comparison. Defaults false/leading
отмечены как assumptions; old accepted absence остаётся Unavailable. Worker0.14
применяет native beta/timestep semantics; DPM++ SDE + ZTSNR отказывает явно.
На этом CPU/controlled transport/storage checkpoint trained NoobAI author
recipe и release ещё не были квалифицированы. Статус «Пока не обещать» сохранён; исторические checkpoints
ниже описывают границы своего времени.

Текущий v-prediction срез (07.10.2026): [Installed Illustrious v-prediction qualification](./engineering/phase-2c-installed-v-prediction-research.md)
проверяет exact Cyberfalafel v-pred v1.2 by Knightus_Ai, CivitAI model/version/file
1147756/2679856/2566634, с сохранённым raw `baseModel=NoobAI` и принятой
Illustrious family mapping. Model Manager остаётся единственным владельцем
override точного файла; Project показывает текущую интерпретацию read-only.
Четыре finite installed txt2img/img2img completions прошли при
256×256/трёх шагах/seed `0`/Euler a/Embedded FP32/ordinary LoRA −0.5.
Native каталог из checkpoint и LoRA подготовлен локально; controlled API tests
source admission являются отдельным evidence, а не live CivitAI install/repair.
Смена `v_prediction`/`epsilon` на одних trained weights служит causal control,
не определяет training objective из tensors и не доказывает качество.
ZTSNR/trailing author recipe, другие installed samplers, v-outpaint, network
installation и release остаются открытыми. Статус PP-004 «Пока не обещать»
сохранён; прежние checkpoints ниже сохраняют исторические границы.

Текущий Euler срез (07.10.2026): [обычный Illustrious Euler](./engineering/phase-2c-euler-research.md)
проводит `Euler` / `Normal` → `euler` через выбор, frozen queue/Retry и portable
accepted settings. Worker0.13 с `illustrious-euler` использует настоящий pinned
EulerDiscreteScheduler; старые peers отказывают до публикации или wire request.
Численные CPU проверки и реальный tiny UNet/VAE pipeline отделены от управляемого
inference peer в SQLite/`.igs`/JSONL integration tests. Это не installed trained
Euler proof: ZTSNR, spacing policy, авторский NoobAI V-Pred recipe и полная
поддержка семейства остаются открытыми. Приняты отдельные Model Manager controls
и явно отмеченные неизвестные defaults. Статусы PP-005/007/008 не повышены.

Текущий embedding срез (07.10.2026): [Installed Illustrious embedding qualification](./engineering/phase-2c-installed-embeddings-research.md)
соединяет actual ID-only autocomplete с trained IllustriousPhoto by
CautionMergeAhead, WAI v15 1152steps, и отдельно обозначенным artificial zero
control. Обе exact версии используют один canonical literal; matched positive,
negative и weighted/repeated img2img pairs меняют pixels только при смене
trained/control weight identity. Восемь finite completions при 256×256/трёх
шагах/seed `0`/Embedded FP32/ordinary LoRA −0.5 не доказывают качество или
совместимость всех файлов. Прежние семь resources/девять versions и Defaults
сохранены; две embedding versions дают итоговые восемь resources/одиннадцать
ready versions. Требуемый автором credit сохранён. Local prepared sources не
квалифицируют live product CivitAI install/repair; Anima/presets и release
остаются открытыми. Последующие исторические authoring/inference checkpoints
сохраняют прежние границы evidence; публичный статус PP-004 не повышен.

Текущий внешний VAE срез (07.10.2026): [Installed external VAE qualification](./engineering/phase-2c-installed-external-vae-research.md)
соединяет точный выбор в Project с настоящим installed inference. Восемь finite
FP32 случаев проверяют Embedded, exact LDM/native и явно искусственный control
в txt2img и common-source img2img при strength 0. После настоящей смены library
Default и Reset frozen Retry сохраняет исходный native VAE. Это исполнение
локальных prepared weights, не live CivitAI install или отдельная training lineage;
полная совместимость библиотеки и release остаются открытыми.

**Продуктовый статус:** принято как обязательный MVP scope.

**Публичный статус:** пока не обещать как готовую возможность. В production
Model Manager реализованы локальная установка из CivitAI URL, проверка целостности,
repair и независимые версии, в том числе custom Anima с закреплёнными Qwen3/VAE;
их пути проверены с SQLite и файловой системой.
Production Project выбирает точную установленную версию checkpoint и сохраняет
проверенную main ссылку в `.igs`; смена Default и исчезновение файла не
подменяют этот выбор. После переноса `.igs` пользователь может явно связать
сохранённую версию с точной установленной копией CivitAI-файла; меняются только
локальные ID, а правка сохраняется обычным Save. Полная загрузка/совместимость
моделей в worker и связи с Presets остаются открытыми;
LoRA и VAE имеют отдельные checkpoints ниже.

[Staging publication correction](./engineering/model-install-staging-publication-research.md)
удаляет собственные staging hardlinks и синхронизирует каталог до публикации
установленной версии в SQLite. Это предотвращает ложный integrity refusal,
когда прежняя post-success очистка меняла ctime корректного файла во время
точной проверки. Реальные install/repair, отказ удаления и late Cancel проверены
с соседними rollback/reuse cases; строгая проверка целостности сохранена.
Полный lifecycle и публичный статус PP-004 этим не закрываются.

[Anima loader foundation](./engineering/phase-2c-anima-qualification-research.md)
проверяет exact saved checkpoint и связанные pinned Qwen3/VAE в Main, затем
полный native Cosmos/conditioner/Qwen3/Wan state в Python. Реальные локальные
веса загрузились offline на CPU с production profile; это отдельная проверка
загрузки, без conditioning, denoising или GPU generation. Checkpoint SHA не
служит allowlist; несовместимая topology отвергается. Следующий
[conditioning foundation](./engineering/phase-2c-anima-conditioning-research.md)
добавляет exact bundled tokenizers и weighted Qwen3/adapter conditioning,
проверенные отдельно на trained CPU weights. Anima Generate остаётся
заблокированным до editor handoff и сквозной pipeline qualification;
PP-004 не объявляется завершённым.

Следующий [Anima Euler foundation](./engineering/phase-2c-anima-euler-research.md)
проверяет internal weighted Cosmos/Wan txt2img и opaque img2img, включая
actual trained NVIDIA pixels, seed replay и finite/padding guards. Проверка
ограничена 256×256 и тремя шагами; другие schedulers/options, editor handoff,
queue/provenance и release остаются открытыми. Это не открывает Anima Generate
и не завершает managed-library promise. Следующий
[ordinary Anima LoRA foundation](./engineering/phase-2c-anima-lora-research.md)
добавляет exact Main/file/native qualification и scoped signed adapters до
Qwen/conditioner encoding. Shared native Linear profile, complete tensor/rank/alpha
проверки, signed stack и cleanup подтверждены отдельно; trained GPU controls
охватывают три локальные backbone LoRA, tiny native tests — также Qwen и
conditioner. Public admission/queue/provenance и release не расширены.
Следующий [deterministic sampling foundation](./engineering/phase-2c-anima-sampling-research.md)
проверяет internal Euler/Heun/DPM++ 2M с отдельными native schedules и fresh solver
history, actual evaluation counts и selected-schedule interior img2img. Stochastic
методы/LCM реализованы в следующем checkpoint; public integration и release
остаются открытыми; PP-004 не завершён.

[Six-method flow sampling](./engineering/phase-2c-anima-flow-sampling-research.md)
завершает internal numerical registry DPM++ 2M SDE/ER-SDE/FlowMatch LCM рядом
с deterministic methods. ER solver переносится точными upstream bytes с
лицензиями; step RNG и history принадлежат одному запросу. Типизированная policy
и native controls проверяют LCM shift/clipping correction, replay и finite/cleanup
границы. Public integration, модельное качество и runtime/release qualification
остаются открытыми; PP-004 не завершён.

[Anima worker entrypoint](./engineering/phase-2c-anima-worker-entrypoint-research.md)
подключает typed compiled commands к inference worker 0.11.0: offline native
bundle, обе weighted полярности, шесть методов, signed LoRA, opaque img2img,
provisional sRGB PNG и thumbnail. Anima capability объявляется только при
native CUDA BF16; Illustrious остаётся доступным на остальных qualified CUDA
GPU. Это внутренний worker checkpoint: Project admission, durable queue/Retry,
accepted provenance и release остаются открытыми. Статус PP-004 не повышен.

[External VAE authoring](./engineering/phase-2c-external-vae-authoring-research.md)
добавляет установку/repair CivitAI VAE компонентов с labels `Illustrious` или
`SDXL 1.0`, сохраняя raw source metadata и запрет standalone SDXL checkpoints.
Project выбирает точную проверенную версию, сбрасывает к Embedded или явно
связывает portable reference; Undo/shadow/Save/reopen и смена Default сохраняют
эту identity. Late selection/relink не перезаписывают последующие действия,
включая edit → Undo. Anima companion остаётся закреплённым. Installation integrity
не объявляется ML qualification. Следующий
[external VAE inference checkpoint](./engineering/phase-2c-external-vae-inference-research.md)
подключает exact source/SHA/size/header verification перед Prepare, materialization,
Retry и dispatch. Worker 0.9.0 проверяет полный набор тензоров и загружает standalone
LDM/native Diffusers VAE с pinned SDXL config. Совпадение формы весов не доказывает
training lineage; старые peers и changed/unsupported files отказывают явно.
Публичный статус PP-004 не повышен.

[Exact embedding authoring](./engineering/phase-2c-embedding-authoring-research.md)
связывает установленную Illustrious версию с обоими Project prompts. Новый token
использует original safetensors filename stem в угловых скобках; `trainedWords`
служат поиску, без negative alias. Main проверяет managed bytes/source/token,
связывает uniquely owned canonical input либо ждёт explicit selection при
collision. Missing/corrupt installed owner не превращает соседнюю версию в
автоматический выбор. Сохранённая identity переживает rename/Default/file loss;
portable Link меняет только локальные IDs. SQLite/filesystem tests проверяют
authoring, не tensor loading. Qualified Illustrious inference подключён
следующим checkpoint; Anima embedding actions остаются открытыми; PP-004 не объявляется завершённым.

Project → Model Manager теперь фокусирует выбранный checkpoint и помечает его
точную версию без смены Default или Project reference; Electron smoke проверяет
повторное открытие после фильтров и предупреждение при отсутствующем локальном
ID. [Resource handoff](./engineering/phase-2c-resource-handoff-research.md) теперь
передаёт категорию даже без выбранного ресурса, добавляет LoRA entry и exact-row
переход, сохраняет embedding trigger при проверке каталога. Native checks
проверяют возврат с обновлением доступности exact файлов, различие Project
version/Default и неизменность draft/history/bbox/Save snapshot. Fixture
восстановления файла не доказывает CivitAI repair. Preset handoff, installed
resource thumbnails и полный PP-004 остаются открытыми.
[Model Manager read ordering](./engineering/phase-2c-model-manager-read-research.md)
отдельно квалифицирует запоздавшие catalog/jobs/storage/token ответы, ошибки и
loading после нового открытия. Native RED воспроизводит восемь сбоев, свежий
GREEN проходит все 11 checks. Полный список jobs сохраняет updates, наблюдавшиеся
во время запроса, и нетронутые строки Main. Guard не отменяет команды установки;
actual download/repair, token secret-storage mutation и полный PP-004 остаются
открытыми. Публичный статус не повышен.

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
[Обычные Illustrious LoRA](./engineering/phase-2c-lora-research.md) теперь проходят exact-file/header preflight и применяются в normal txt2img/img2img. Public Anima и другие adapter algorithms ещё не подключены; internal ordinary
Anima helper описан выше. Install сам по себе не доказывает inference compatibility.

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

[Illustrious embedding inference](./engineering/phase-2c-embedding-inference-research.md)
добавляет paired dual-CLIP safetensors в обе normal prompt-полярности worker
0.10.0. Exact Main verification, worker snapshot/finite/dtype checks и реальный
public loader/native pipeline имеют отдельные evidence от authoring. Dynamic
jobs/Retry/dispatch используют frozen effective files; old worker, changed или
unsupported input отказывают явно. Synthetic tensors не доказывают trained
embedding quality или совместимость всех CivitAI файлов. Этот исторический
checkpoint дополнен bounded installed trained evidence выше; PP-004 остаётся
неполным.

[Anima authoring](./engineering/phase-2c-anima-authoring-research.md) добавляет
optional native method в production draft, family-aware prompt attention и
history/shadow/explicit Save. Model switching сохраняет неактивные настройки;
редактор не придумывает Euler и не меняет квалификацию модели. Anima Main
admission, очередь, provenance и release остаются открытыми; PP-004 не завершён.

[Anima Main preparation](./engineering/phase-2c-anima-main-preparation-research.md)
захватывает Project inputs до await, квалифицирует exact linked bundle и ordered
enabled adapters, повторно проверяет файлы и строит qualified ephemeral requests для всех
concrete prompt/seed items. Это не расширяет public Generate или durable queue;
PP-004 остаётся открытым.

[Anima durable jobs](./engineering/phase-2c-anima-durable-jobs-research.md)
теперь повторно квалифицирует captured exact checkpoint/Qwen3/VAE и ordered
effective LoRAs при frozen Retry/dispatch, без чтения текущего Default или draft.
Это проверка операционной идентичности, а не обещание совместимости каждого
CivitAI файла, trained-model quality или установленного release runtime.
Public Anima Generate и portable accepted configuration остаются открытыми;
статус PP-004 не повышен.

[Public Anima integration](./engineering/phase-2c-anima-public-generation-research.md) теперь подключает captured Generate к
exact original checkpoint/Qwen3/VAE и signed LoRA через existing runtime/queue
owners. Native capability проверяется повторно Main; unsupported SD controls и
непригодные ресурсы отклоняются явно. Каталог передаёт path-free companion
identities из текущих verified installed bindings при прежнем быстром stat/cache
статусе, без обещания cold full-file tamper detection. Полная requalification
остаётся в Generate/dispatch. Trained-model/release qualification и полный
PP-004 остаются открытыми.

[Installed runtime checkpoint](./engineering/phase-2c-installed-runtime-qualification-research.md)
подтверждает startup изолированного app-owned development runtime и production
routing CPU derivatives без source/system Python fallback вне явного
development/test режима. Проверены canonical pointer/path, offline environment,
coexistence с работающим inference и единый physical-exit fence для failed
startup и failed close. Финальный native Electron прогон завершил четыре
trained сценария Illustrious/Anima × txt2img/opaque img2img при 1024×1024 и трёх
шагах через UI Generate, installed CUDA worker, signed LoRA, явный Add и rendered
Save/reopen. Точные существующие веса скопированы и проверены как предусловие
в isolated catalog; это не проверка CivitAI download/install, совместимости
каждого файла, качества моделей или других GPU. Release installer/repair,
полные options и связи с Presets остаются открытыми; PP-004 и его публичный
статус не повышаются.

## PP-005: Принятый результат хранит настройки генерации

Дополнительные evidence references: [provenance в Vue prototype](./features/project/generate-mode/generation-provenance.md#vue-prototype-coverage) и [Project Undo/Redo](./engineering/phase-2b-project-undo-research.md). Prototype comparison/result-to-preset использует mocks; Undo evidence относится к сохранению/откату уже принятых слоёв.

Текущий подтверждённый [Installed image uint32 MAX→0 wrap](./engineering/phase-2c-illustrious-image-seed-wrap-research.md): четыре EPS/V × IMG/normal mixed-alpha OUT; 16 admissions/completions/accepted saved layers,12 Save/reopen packages,8 wholeRGBA matches с отдельными numeric MAX/0 controls и4 same-prompt contrasts. Independent raw readback PASS (8178 checks): immutable configuration/source contexts, cursor/Save snapshots, 11 old tables и43 worker identities сохранены. Main modulo mutation:4 semantic RED,8 neighbors GREEN,12 fresh restored GREEN; 137 focused tests PASS. Только256×256/Normal N3, one pair×two/per-prompt; native1/2/cross-pair/high-bit mutation/quality/fullMVP/release не заявлены.

Предыдущий подтверждённый [Installed Illustrious/NoobAI image Random → Fixed replay](./engineering/phase-2c-illustrious-image-seed-replay-research.md): Random → numeric Fixed/per-prompt на четырёх EPS/V × common-source IMG/normal mixed-alpha OUT scopes:64 admissions/completions/accepted layers, восемь Save/reopen packages и32 wholeRGBA replay matches. Четыре оригинальных Main crypto picks наблюдены без подмены; policies Random/Fixed, concrete prompts, фактические seeds, LoRA−0.5 и source/conditioning/resources сохранены в accepted provenance (`generationConfiguration` и `layerSourceContext`). Templates/maxPrompts — только pre-admission draft/report; поздние edits остаются отдельно. Independent raw SQLite/ZIP/Pillow readback и43 unchanged installed worker identities подтверждены. Baseline-hook/seedBehavior harness mutations дали1+4 semantic RED с neighboring/fresh restored GREEN; новых trained mutations/crash jobs нет. Только256×256/Normal N3/две observed updates; quality/Invoke trained-pixel parity/fullMVP/release не заявлены. Image Reuse после crash подтверждён отдельным [finite срезом](./engineering/phase-2c-illustrious-image-reuse-crash-research.md):44 admissions/36 completions/8 APP_RESTART/36 accepted saved layers/4 Save-reopen packages,32 Reuse +4 crash wholeRGBA matches. Исходный слой, восстановленный кандидат и cursor B сохранены; setup3/1/2cancel/1accepted-unsaved исключён. Последующий finite [image MAX→0 gate](./engineering/phase-2c-illustrious-image-seed-wrap-research.md) подтвердил16 admissions/completions/accepted saved layers,12 packages и8 own numeric-control wholeRGBA matches; native1/2/cross-pair wrap не заявлены. Следующий отдельный finite cut — image cap32; counts и budgets фиксируются до запуска. Image cap32, dynamic embedding subsets в image modes, Anima image batches, broad formats/geometry/quality/public delivery/release остаются открытыми; PP-004/005/007/008 остаются «Пока не обещать».

Предыдущий подтверждённый [Installed Illustrious/NoobAI per-prompt IMG/OUT](./engineering/phase-2c-illustrious-dynamic-image-per-prompt-research.md): Fixed0/per-prompt, четыре EPS/V × common-source IMG/normal mixed-alpha OUT scopes, четыре weighted positive×negative пары × две iterations, literal seeds0..7; 32 admissions/completions/accepted layers и четыре saved/reopened packages. Восемь first-pair0/1 wholeRGBA references совпали с прежним per-iteration gate; 16 within-pair seed contrasts проверяют только seed effect. Cross-pair prompt causality при разных seeds не заявлена. Concrete prompts, LoRA−0.5 и per-prompt settings остаются frozen в accepted configuration; исходные templates/maxPrompts сохранены в pre-admission draft/report, а не в provenance; поздние green-bowl/grainy prompts, Fixed37/per-iteration, maxPrompts3 и LoRA−0.25 сохраняются отдельно в current draft. Полная OUT source-over композиция проверена; все 43 native worker source identities и application bundles неизменны, старые reports/source hashes сохранены с явной lineage четырёх qualification helpers. Новых trained mutation/crash jobs нет. Executed details и ограничения — в новом research note.

Предыдущий подтверждённый [Installed Illustrious/NoobAI dynamic IMG/OUT](./engineering/phase-2c-illustrious-dynamic-image-research.md): EPS/V common-source IMG/normal mixed-alpha OUT, Fixed0/per-iteration, four weighted positive×negative pairs×2 iterations. Исправленный frozen R2 plan получил independent finite reader PASS (10833 checks): 48 admissions/completions, 40 accepted layers, 8 saved/reopened packages; 4 seed1 numerical RED до Add, 4 seed0 wholeRGBA neighbor GREEN, 8 fresh restored wholeRGBA matches и 48 same-seed prompt contrasts. Четыре OUT previews сохранили soft alpha и 222208 protected-source pixels; restoration всех 43 source identities проверен независимо. Первый исключённый EPS IMG attempt дал 8 admissions/completions/accepted layers и отдельный пакет, но остался failed на неверном all-visible ожидании: Add показывает только выбранный anchor. Qualifier явно показывает остальные variants перед Save; sticky verification failure исправлен только в test harness, production behavior не менялся. Qualified 48/40 отделены от raw 56 completions/48 accepted с первым failed attempt; его пакет не входит в qualified 8. Один control report сохраняет cleanup ENODEV; отдельные source-bound PID/start/cgroup closure supplements подтверждают native/launcher exits, cleanup race не считается numerical RED. Finite gate подтверждён: fresh system proof (820 checks), env/cwd guard sensitivity (точный original refusal, isolated predicate mutation RED, fresh original PASS) и guarded cleanup завершены — R0 9 paths/9117696 allocated B, R2 7 paths/7651328 allocated B; все 43 original source identities сохранены. ENODEV repair применён после original-source reader/cleanup: isolated actual two-file copy дала 30 baseline GREEN, 4 semantic RED/26 neighbor GREEN и 30 fresh restored GREEN; inode/mode/mtime/SHA восстановлены точно, без ML reruns; PP-004/005/007/008 остаются «Пока не обещать». На этом историческом checkpoint image Random/Reuse/wrap/cap32/crash, dynamic embedding subsets в image modes и Anima image batches оставались открытыми; завершённый Random-follow-up описан выше. FullMVP/quality/Invoke trained-pixel parity/public delivery/release не заявлены; PP-004/005/007/008 остаются «Пока не обещать». Этот ранее предложенный Random → Fixed replay теперь подтверждён отдельным [Installed Illustrious/NoobAI image Random → Fixed replay](./engineering/phase-2c-illustrious-image-seed-replay-research.md). Image Reuse после crash подтверждён отдельным [finite срезом](./engineering/phase-2c-illustrious-image-reuse-crash-research.md):44 admissions/36 completions/8 APP_RESTART/36 accepted saved layers/4 Save-reopen packages,32 Reuse +4 crash wholeRGBA matches. Исходный слой, восстановленный кандидат и cursor B сохранены; setup3/1/2cancel/1accepted-unsaved исключён. Последующий finite [image MAX→0 gate](./engineering/phase-2c-illustrious-image-seed-wrap-research.md) подтвердил16 admissions/completions/accepted saved layers,12 packages и8 own numeric-control wholeRGBA matches; native1/2/cross-pair wrap не заявлены. Следующий отдельный finite cut — image cap32; counts и budgets фиксируются до запуска. Image cap32, dynamic embedding subsets в image modes, Anima image batches, broad formats/geometry/quality/public delivery/release остаются открытыми; PP-004/005/007/008 остаются «Пока не обещать».

Предыдущий [Installed NoobAI multiple-LoRA IMG/OUT](./engineering/phase-2c-noobai-lora-stack-image-research.md): EPS/V common-source IMG/normal mixed-alpha OUT:22 admissions/completions,18 accepted Save/reopen/comparisons. Exact configured/effective AB/BA, B-enabled-zero/B-disabled; Digital Art A−0.5/Lineless B+0.75, ordinary unweighted prompts, external VAE FP32. Normal N3/CFG5/Fixed0/strength0.5 даёт2 actual updates. Один EPS resource-weight-swap cycle даёт2 visible-RGB/composite RED до Add,2 disabled-neighbor fullRGBA GREEN и2 fresh restored;4 provisional controls/0 mutant acceptance. В четырёх healthy objective/mode scopes zero и disabled совпадают в completeRGBA; nonzero B меняет visible output, без требования AB/BA pixel inequality. Четыре bounded native probes проверяют16 captured ordered stack handoffs и24 independent low-rank algebra variants,без дополнительных image jobs. Independent raw SQLite/ZIP/full source-over preview,43 original source identities и final physical idle PASS. Только256×256 и declared sources/grids; installed V weight-swap pixel causality не заявлена. Historical Karras TXT wrong-EPS pixel RED остаётся gap. FullMVP/quality/Invoke trained-pixel parity/public delivery/release не заявлены. На этом multiple-LoRA checkpoint dynamic common-source IMG/normal OUT ещё был открыт; текущая qualification описана отдельно. Broad formats/quality/release остаются gap.

Предыдущий [Installed NoobAI signed embedding IMG/OUT](./engineering/phase-2c-noobai-embedding-image-polarity-research.md): EPS/V common-source IMG/normal mixed-alpha OUT:18 admissions/completions,13 accepted Save/reopen/comparisons. Normal N3/CFG5/Fixed0/strength0.5 даёт2 actual updates; exact trained/zero versions в обеих полярностях. Один EPS signed-resource-swap cycle даёт4 directional visible-RGB/composite RED: mutant fullRGBA совпадает с противоположным healthy; ordinary EPS IMG neighbor fullRGBA GREEN,4 fresh restored,5 provisional controls/0 mutant acceptance. Четыре bounded native probes дают16 independent assignments и128 hidden/pooled tensor+handoff matches, branch isolation,0 extra image jobs. Independent raw SQLite/ZIP/full source-over preview,43 original source identities и final physical idle PASS. Только256×256, one literal per polarity,Digital Art−0.5/externalVAE FP32/declared sources; V sign-swap pixel causality не заявлена. Historical Karras TXT wrong-EPS pixel RED остаётся gap. FullMVP/quality/Invoke trained-pixel parity/public delivery/release не заявлены. Последующий multiple-LoRA image checkpoint описан отдельно.

Предыдущий [Installed NoobAI V DPM++ 2M IMG/OUT](./engineering/phase-2c-noobai-vpred-dpm-image-research.md): V/true-ZTSNR/leading Normal/Karras common-source IMG/normal OUT:16 admissions/completions,10 accepted Save/reopen/comparisons. N4 оставляет2 neighbor/3 history updates; один history-reset cycle даёт4 visible-RGB/composite RED,2 fullRGBA GREEN,4 fresh restored,0 mutant acceptance. Independent raw SQLite/ZIP/full source-over preview,43 original source identities и final physical idle PASS. Только256×256/N4/CFG4/Fixed0/LoRA−0.5/externalVAE FP32/declared cutoffs; historical Karras TXT wrong-EPS pixel RED остаётся gap. FullMVP/quality/Invoke trained-pixel parity/public delivery/release не заявлены. Последующий signed embedding image checkpoint описан отдельно.

Предыдущий [Installed NoobAI V DPM++ 2M TXT](./engineering/phase-2c-noobai-vpred-dpm-research.md): Normal/Karras при true-ZTSNR/leading. 8 actual admissions, 7 completions, 5 accepted saved/reopened packages и owning comparisons; Normal wrong-EPS даёт pixel RED до Add, EPS neighbor сохраняет pixels. Karras wrong-EPS отказал до candidate; отдельный bounded replay воспроизвёл UNet NaN, но исходный traceback утрачен и Karras pixel RED не доказан. Оба fresh V restored воспроизводят completeRGBA; два protected cycles восстанавливают43 source bytes/identities, 0 mutant acceptance, independent raw aggregate и final physical idle подтверждены. Только256×256/N4/CFG4/Fixed0/LoRA−0.5/externalVAE FP32. First baseline combined peak/launcher exit неизвестны; остальные семь cases measured. FullMVP/quality/Invoke trained-pixel parity/public delivery/release не заявлены. Последующий bounded IMG/OUT срез описан отдельно.

Предыдущий [Installed five-sampler campaign](./engineering/phase-2c-sampler-campaign-research.md): Anima DPM++ 2M SDE/ER-SDE/LCM IMG/OUT и EPS Illustrious-family DPM++ 2M/SDE Normal/Karras TXT/IMG/OUT. 68 finite admissions/completions, 43 accepted saved/reopened packages и owning comparisons; 25 provisional controls дают18 numerical RED до Add и7 неизменённых neighbor GREEN, 0 mutant acceptance. Все18 fresh restored cases воспроизводят completeRGBA; 14 accepted OUT packages сохраняют contribution alpha, source и полный независимый merged preview. Все пять mutations восстанавливают43 installed source bytes/identities; independent aggregate 19102 checks и final physical exit подтверждены. Только256×256/CFG4/Fixed0/LoRA−0.5 и declared finite grids. FullMVP/public statuses/quality/release остаются открытыми. На этом campaign V DPM++ 2M profile interaction ещё был открыт; последующий bounded TXT срез описан отдельно.

Предыдущий [Installed Anima DPM++ 2M IMG/OUT](./engineering/phase-2c-anima-dpmpp2m-image-research.md): 8 admissions/completions, 5 accepted saved/reopened packages и owning comparisons, с отдельным неизменённым source layer. При authored4 neighbor IMG strength0.5 выполняет2 first-order updates; history IMG/OUT strength0.75 —3 updates с second-order history. Installed history reset: neighbor IMG pixels GREEN, history IMG/OUT RGB RED до Add (alpha неизменна; IMG 65395 / OUT 25794 видимых changed pixels), 0 mutant accepted. Exact43-file bytes/identity restoration и fresh IMG/OUT fullRGBA replay; independent aggregate 2753 checks, полный affine/source-over preview. Только256×256/CFG4/Fixed0/Myth−0.5; fullMVP/release status неизменен. На этом DPM++ 2M checkpoint следующий SDE IMG/OUT gate ещё был открыт; позднейший five-sampler campaign закрывает выбранные finite cases.

Предыдущий [Installed Anima Heun IMG/OUT](./engineering/phase-2c-anima-heun-image-research.md): 5 admissions/completions, 3 accepted saved/reopened packages и owning comparisons, отдельный неизменённый source layer в каждом. Heun4/strength0.5 даёт3 evaluations. Installed premature-mask mutation: IMG pixels GREEN / OUT visible RGB RED до Add (alpha неизменна, 25819 изменённых видимых пикселей), 0 mutant accepted. Exact43-file restoration и fresh OUT rawRGBA replay, independent aggregate 2578 checks; полный affine/source-over preview проверен. Только256×256/CFG4/Fixed0/Myth−0.5, fullMVP/release status неизменен. На этом Heun checkpoint DPM++ 2M IMG/OUT ещё был открыт; его завершённый follow-up записан выше.

Предыдущий [installed Anima ER-SDE order3 checkpoint](./engineering/phase-2c-anima-er-sde-order3-research.md)
подтвердил five-step TXT и three-step neighboring control: 5 admissions и
5 finite completions, 3 accepted saved/reopened packages и owning comparisons.
Отключение только installed dd_x0 correction сохраняет three-step pixels и
меняет five-step pixels до Add; оба controls имеют 0 accepted layers.
Восстановлены все 43 исходных bytes/inode/mode/mtime; fresh five-step результат
совпал по пикселям. Independent raw aggregate: 1750 checks, PASS. Прежняя попытка
с ошибкой cleanup учтена отдельно: +3 admissions/completions и +2 accepted
packages; raw totals8/8/5/5. Граница — TXT256/CFG4/Fixed0/Myth−0.5;
PP-004/005/007/008 сохраняют «Пока не обещать». Heun IMG/OUT был следующим gate на этом checkpoint; он завершён в follow-up выше. Остальные image modes, полный
policy/geometry/format/quality и release остаются открытыми.

Последний [installed cap32/bounded truncation checkpoint](./engineering/phase-2c-generation-batch-cap-research.md)
проверил Anima и точные Illustrious-family EPS/V: четыре weighted positive×negative
пары × восемь iterations, Fixed0/per-iteration дают 32 native outputs без truncation;
первые три пары × две iterations, Fixed0/per-prompt дают 6 outputs с явным truncation.
Independent aggregate PASS: 114 admissions/114 finite/114 accepted saved layers,
6 accepted saved/reopened packages и 114 per-layer comparisons; все 18 selected-prefix
outputs совпали по same-input pixels с boundary indices 0,1,10,11,20,21.
Три настоящих confirmed 33-job UI refusals сохранили все 32 temporary results
и captured queue/receipts/cursor/staging/Project DTO/private shadow/saved package.
Проверены Undo/Redo availability flags; внутренний Undo stack не снимался.
Пять actual-source mutations: 204 executed tests/22 semantic failures, baseline
и fresh restored по 52/52 GREEN, 0 skipped; focused 349/349/typecheck/build GREEN.
Граница — TXT 256×256/три steps; полный policy/mode matrix, non-Euler IMG/OUT,
форматы/геометрия/качество/public delivery/release и full MVP остаются открытыми.
На этом checkpoint ER-SDE order3 ещё оставался открытым; bounded follow-up описан выше.
Статус «Пока не обещать» сохранён; прежние counts ниже относятся к своим checkpoint.

Предыдущий [installed Random/uint32 seed checkpoint](./engineering/phase-2c-generation-seed-boundary-research.md)
проверил Anima и точные Illustrious-family EPS/V через настоящие renderer/Main,
installed worker 0.14, Add/Save/readback/reopen и 42 сравнения принятых слоёв. Для
каждого objective наблюдался один оригинальный Main cryptographic Random base;
Fixed numeric replay воспроизвёл same-input pixels, per-prompt wrap дал MAX/0/1/2,
а fresh MAX/0 после exact restoration воспроизвёл healthy wrap pixels. Три
installed high-bit RNG mutations дали pixel RED до Add/0 accepted mutant layers.
Поздние queue строки не служили источником ожидаемых seeds; requested policy,
actual seed и selected behavior сохранились в portable provenance после current
prompt/sampler/seed 37/LoRA/dynamic edits.

Independent raw SQLite/ZIP/Pillow aggregate PASS (15,006 checks): 54 qualified admissions,
45 finite outputs (36 normal, 3 provisional mutant, 6 fresh), 42 accepted saved layers
в 12 reopened packages и 9 APP_RESTART. Raw 58 admissions/49 outputs/46 saved layers/
13 packages/9 cancellations отдельно включают прежний healthy EPS Random 4/4/4/1,
не входящий в uniform current-source matrix. Два исключённых setup 0/0 не являются
semantic RED. Original 302 queue rows/186 cursors/249 receipts, catalog 9/14/defaults,
восемь original sources и 43 restored worker source/assets сохранены; final physical
idleness подтверждён. Full MVP/readiness этим не закрыты. На этом прежнем срезе следующим gate был
cap 32/bounded truncation; bounded follow-up приведён выше; полный policy/mode matrix, replacement-document identity,
форматы/геометрия/качество/public delivery/release остаются открытыми.
Статус «Пока не обещать» сохранён.

Предыдущий [installed dynamic embedding checkpoint](./engineering/phase-2c-illustrious-dynamic-embeddings-research.md)
(09.10.2026) проверил full authored refs/effective native subsets у EPS/V:
ordinary, negative-only, positive-only, both. Независимый raw aggregate:
20 qualified admissions/16 completions/4 APP_RESTART,4 saved packages/12 layers;
raw24/16/8 включает отдельный resource-stop с4 jobs/0 outputs. Обе negative-vector
mutations дали numerical RED до Add при GREEN ordinary, fresh4 восстановили
pixels. Actual completion остаётся temporary до Add; Save/reopen/12 comparisons
сохраняют concrete refs и snapshot0 при удалённых live sidecars. Catalog9/14,
prior278 queue rows/source43 сохранены; новый Anima ML run не выполнен.
На этом historical checkpoint Random/uint32 оставались открытыми; отдельный
seed follow-up описан выше. Broader caps/seed-policy combinations,
formats/quality/public delivery/release и полный MVP остаются открытыми. Статус «Пока не обещать» сохранён.

Предыдущий [installed Illustrious/NoobAI dynamic checkpoint](./engineering/phase-2c-illustrious-dynamic-batch-research.md)
(09.10.2026) проверил exact EPS/V, Fixed0/per-iteration и crash-recovered local
Reuse0/per-prompt через renderer/Main/installed worker0.14 и явный Add/Save/reopen.
Независимый raw SQLite/ZIP/Pillow aggregate:58 admissions/42 completions/16
APP_RESTART,6 saved packages/38 accepted layers; один исключённый0-job selector
setup учтён отдельно. Обе generation-RNG seed-alias mutations дали causal pixel
RED до Add (4 provisional/0 accepted), после restoration —4 fresh GREEN.
Catalog9/14/defaults/prior220 queue rows и43 source/assets сохранены, physical idle
подтверждён. Новый Anima ML run этим срезом не выполнен. Его прежний gap
Random/uint32 закрыт в bounded seed follow-up выше; max32/truncation/full
Fixed-per-prompt matrix/formats/quality/public delivery/release и полный MVP
остаются открытыми. Статус «Пока не обещать» сохранён.

Предыдущий [installed Anima dynamic-batch checkpoint](./engineering/phase-2c-anima-dynamic-batch-research.md)
(09.10.2026) проверил actual positive×negative expansion, Fixed0/per-iteration8
и recovered local Reuse0/per-prompt8. Настоящий crash сохранил completed candidate0
и local cursor0 при null portable snapshot; два unfinished jobs получили
APP_RESTART. Frozen prompts/method/weights/seeds пережили current draft edits.
Normal17 completions/19 admissions, semantic noise-seed-alias2 provisional outputs
с pixel RED до Add/0 accepted и fresh restored2 GREEN дают три saved/reopened
packages/19 accepted layers со snapshots1,7,1. Независимый raw SQLite/ZIP/Pillow
aggregate отделяет29 qualified admissions от40 raw attempts и одного excluded
accepted unsaved shadow. Catalog9/14/defaults сохранён, все43 source/assets
восстановлены, physical idleness подтверждён. Illustrious/NoobAI counterpart
и отдельный seed follow-up записаны выше. Max32 native/truncation/formats/quality/
public installer/release и полный MVP остаются открытыми. Статус «Пока не обещать» сохранён.

Предыдущий [Installed Anima worker0.14 regression](./engineering/phase-2c-anima-worker-014-regression-research.md) (08.10.2026)
проверил 8 normal finite полных UI cycles в 9 admissions с одним actual Cancel:
шесть native TXT methods, Euler opaque IMG и mixed-alpha OUT через frozen Retry.
Bounded settings — 256×256, три requested steps, CFG4, fixed seed0, обычная
Myth Portrait LoRA−0.5, positive weight1.3 и negative0.7. Captured bundle, native
method, weighted prompts и signed LoRA остаются frozen после current prompt/
method/seed37/weight−0.25 edits; explicit Add/Save/readback/reopen и read-only
comparison сохраняют exact portable configuration и pixels. Heun TXT выполняет
пять evaluations; Euler IMG/OUT strength0.5 — два.

Installed token-weight omission сохранила correct frozen inputs и дала один
finite provisional completed candidate, затем same-input pixel RED до Add:
0 accepted mutant layers/0 saved mutant cycles. Raw native cleanup превысил
свой deadline. Protected restoration независимо проверила physical idle
и восстановила все43 original worker sources; поздний bounded proof отдельно
подтвердил exit с сохранением исходных cleanup errors. Fresh Euler TXT/IMG/OUT3 полных
cycles воспроизводят healthy same-choice pixels. Всего подтверждены11 saved/
reopened accepted packages и13 new admissions; candidate mutation не добавляется
к accepted count. Catalog9 resources/14 versions сохраняет prior6/10/defaults:
четыре managed files приняты в отдельном initial0-job UI setup, добавлены только
три owners и Anima version существующего Cyberfalafel CivitAI resource.

На этом историческом checkpoint dynamic multi-job/seed/crash Reuse оставались
открытыми; следующий bounded Anima checkpoint записан выше. Non-Euler IMG/OUT, ER-SDE order3, arbitrary formats,
качество/Invoke author recipe/public delivery/release и полный MVP этим bounded
срезом не квалифицированы; статус «Пока не обещать» сохранён. Предыдущие checkpoint
counts и historical limits ниже не расширяются.

Отдельный [installed multiple-LoRA UI checkpoint](./engineering/phase-2c-noobai-lora-stack-ui-research.md)
подтвердил 8 normal EPS/V TXT cycles в 8 admissions: AB, BA, B-enabled-zero и
B-disabled на objective, 256×256/три steps/seed0, native external VAE/FP32.
Exact Digital Art−0.5/Lineless+0.75 выбираются через настоящий UI; remove/re-add
задаёт порядок без отдельного reorder control. Полный configured stack и ordered
enabled subset остаются frozen после live reorder/weight edits. Explicit Add и
Save/readback/reopen сохраняют exact portable identities, порядок, enabled/weight
и текущий draft. UI comparison проверяет ordered name/version/SHA/enabled/weight;
CivitAI IDs независимо проверены в portable provenance, без утверждения о проверке
каждого rendered description field. B-zero и B-disabled дают одинаковые pixels;
AB и BA отличаются от этих controls, без требования pixel relation между AB/BA.
Strict catalog6/10 сохраняет исходные девять versions: единственная adoption
171,540,060-byte Lineless выполнена в отдельном setup; normal и fresh runs добавили
0 managed files. Installed weight-swap дал causal same-input pixel RED на первом
finite AB candidate до Add: 1 provisional completion, 0 accepted layers и
0 полных saved cycles. После physical exit восстановлены43 original inode/mode/
mtime/bytes, backup отсутствует; fresh restored EPS4 GREEN воспроизводит все четыре
healthy same-choice pixels, physical native exit подтверждён. Independent SQLite/
raw ZIP/Pillow aggregate проверил 12 qualified saved cycles/packages (8 normal+
4 fresh), точные receipts/pixels/ordered tuples; 14 total admissions включают ещё
1 provisional mutant и1 excluded saved setup partial. Все prior model/queue rows
сохранены, final Main/worker idle и43 exact sources подтверждены. Предыдущие native
algebra counts остаются отдельными. Этот historical gate предшествует bounded
Anima worker0.14 и bounded dynamic/seed checkpoints выше. Cap32/bounded truncation был открыт на этом срезе; завершённый bounded follow-up приведён выше.
Arbitrary formats/quality/Invoke parity/public delivery/release и статус
«Пока не обещать» не закрыты.

Предыдущий [native multiple-LoRA checkpoint](./engineering/phase-2c-noobai-lora-stack-native-research.md)
подтвердил12 normal EPS/V loader variants/11832 all-target observations на
half-loaded trained checkpoints: exact Digital Art−0.5 и Lineless+0.75, полный
986 targets каждого source и union986 (UNet722/CLIP1 72/CLIP2 192). Independent
source/graph mapping и temporary FP32 CPU module algebra проверяют single/AB/BA/
enabled-zero controls, source→adapter→signed weight binding и unload restoration.
Оба normal PID exits и43 original sources подтверждены. Это0 UI jobs/images/
receipts/conditioning/denoising; catalog5/9 и153 queue rows не пополняются,
source use остаётся local precondition без adoption/download/runtime copies.
Installed weight-swap mutant прошёл2 healthy single variants/1972 observations,
затем дал точный AB numeric RED. После physical child exit восстановлены43
original inode/mode/mtime/bytes, backup отсутствует; fresh EPS6 GREEN/5916
observations воспроизводит normal base SHA. Final proof подтверждает unchanged
полные catalog/queue rows5/9/153 и managed files, Main/worker idle и current
oracle SHA во всех четырёх executions. Additive A/B и B/A совпадают в пределах
FP32 tolerance; immutable stack order по-прежнему recorded setting. Этот native
checkpoint не проверял multiple-LoRA UI→queue→Add/Save/readback/reopen/comparison;
отдельный completed UI follow-up описан выше; historical native counts не расширяются.
Исторические counts и «Пока не обещать» сохранены. На этом native checkpoint
Anima0.14/dynamic/arbitrary formats/quality/Invoke parity/public delivery/release
оставались открытыми; последующий bounded Anima срез описан выше.

Предыдущий installed [embedding polarity срез](./engineering/phase-2c-noobai-embedding-polarity-research.md)
(08.10.2026) прошёл четыре finite normal EPS/V TXT UI cycles: literal prompts и
точные signed Z/T,T/Z refs сохраняются через Add/Save/readback/reopen/comparison
при256×256/трёх steps, frozen0/current draft37, LoRA−0.5 и native external VAE/FP32.
Три успешных native oracles независимо проверили12 direct T/T,T/Z,Z/T,Z/Z
hidden/pooled/handoff assignments с branch isolation; это не generated jobs.
Oracle использует rehydrated frozen queue jobs и queue ID для correlation;
точный live dispatch проверяют отдельно настоящие UI cycles.
Installed EPS sign-swap дал causal directional RED после двух finite UI cycles
при сохранённой pixel inequality; restored43/original inode/mode/mtime/bytes,
backup absence/physical exit и fresh EPS pair2 GREEN подтверждены. Final evidence
проверяет все8 saved packages/Pillow pixels, SQLite completed rows/receipt bytes,
exact signed refs/settings и accepted frozen0 при saved current draft37. Mutant
pixels равны противоположным normal assignments, fresh — своим normal choices.
Catalog5/9 сохранён без новых managed files. Multiple-LoRA order, Anima0.14,
dynamic, arbitrary formats/quality/Invoke parity/release и полный MVP открыты;
прежние counts и «Пока не обещать» сохранены.

Текущий installed component срез (08.10.2026):
[Installed NoobAI components](./engineering/phase-2c-noobai-component-inference-research.md)
проверяет independently expected tuple во всех 36 EPS/V txt/img/outpaint cases
и двух completed restored Retry. Exact checkpoint/VAE/LoRA/embedding refs,
обе polarity, prediction/noise/sampler и actual seed0 сохраняются через explicit
Add/Save, независимый package readback, reopen и read-only comparison. Disabled
LoRA сохраняет authored reference/weight при пустом effective stack; каждый
embedding control сохраняет другой sign. Lifecycle Retry использует frozen0
при реальном current draft37 после Default/component/prompt edits. Native/LDM
pixel equality относится к одним и тем же extracted weights; decoder-only
control не доказывает независимый encoder effect. Это bounded256×256/три шага;
четыре installed EPS-txt2img component mutations дали causal pixel RED после
шести finite Generate/Add/Save/readback/reopen cases каждая. Fresh restored
EPS-txt2img normal прошёл шесть finite cycles с native physical exit.
Bounded polarity follow-up описан выше; multiple-adapter order, Anima worker0.14, dynamic batches,
legacy/relink/crash expansion, качество, Invoke pixel parity и release остаются
открытыми. Статус «Пока не обещать» сохранён.

Последующий [bounded VAE encoder checkpoint](./engineering/phase-2c-noobai-vae-encoder-research.md)
проверил 8 EPS/V TXT/strength0.5 IMG cases с independent expected exact VAE refs
и settings через Generate/Add/Save/readback/reopen/comparison. Actual current
draft seed37 сохраняется, immutable accepted provenance хранит frozen seed0
и исходную VAE version. Artificial control меняет только восемь
`encoder.conv_out.bias` значений на заявленный +0.5; остальные tensors/config
сохранены. TXT equality и IMG inequality доказывают этот bounded encoder effect,
не all-layer/formats compatibility, outpaint encoder или Invoke pixel parity на
этом TXT/IMG checkpoint.
Installed EPS-img2img mutant дал RED после двух finite cycles и восстановлен;
fresh restored pair прошла два finite GREEN cycles с physical exit. Статус «Пока не обещать» сохранён.

Отдельный [outpaint encoder checkpoint](./engineering/phase-2c-noobai-outpaint-encoder-research.md)
подтвердил четыре finite EPS/V normal OUT cycles/четыре admissions и две matched
пары при256×256/трёх requested steps/FP32/seed0/strength0.5 с двумя effective
native denoising evaluations. Exact VAE refs, target и neighboring inputs
сохраняются; одинаковая contribution alpha сопровождается visible generated RGB
и saved merged RGB differences на соответствующих координатах через
Add/Save/readback/reopen/comparison. Current draft37 не заменяет frozen0.
Catalog5/9 не добавляет managed files; physical exit обоих native runs подтверждён.
Installed EPS-OUT encode-zero mutant дал intended visible-RGB RED после двух finite
cycles; physical exit/restored43/original inode/mode/mtime подтверждены. Fresh
restored pair прошла два finite GREEN cycles с physical exit и exact original
EPS RGBA/merged pixels. Final8 OUT cycles (4 normal +2 finite mutation cycles до
causal RED +2 fresh GREEN) связывают CPU control descriptors со всеми frozen VAE
refs и actual SQLite completed rows/receipt bytes. Independent Pillow saved
`.igs` decode проверяет alpha/protected source/corresponding visible/merged pixels;
Main/worker/nativeData idle, restored43/original inode/mode/mtime/bytes, backup отсутствует.
Исторические 8 normal +2 mutation
+2 fresh TXT/IMG counts не меняются. All-layer/formats/quality/Invoke parity и
полный MVP остаются открытыми; статус «Пока не обещать» сохранён.

Предшествующий component source/Prepare срез (08.10.2026):
[NoobAI component research](./engineering/phase-2c-noobai-components-research.md).
Exact component references/bytes и copied metadata сохраняются при Default, side-by-side version, repair и fresh SQLite connection; controlled healthy frozen Retry сохраняет исходные resources/prompts/target/seed после draft edits. Этот source/Prepare checkpoint проверял identity и frozen owners; последующее trained Add/Save/readback/reopen/comparison evidence описано выше. Independent component gates, Anima/new-worker regression и release остаются открытыми. Статус «Пока не обещать» сохранён.

Предшествующий installed NoobAI outpaint checkpoint (07.10.2026):
[Mixed-alpha outpaint qualification](./engineering/phase-2c-noobai-outpaint-research.md)
проверяет два distinct objectives: frozen prediction/noise profile/strength,
contribution alpha и portable resource identities сохраняются через explicit
Add/Save, независимый readback и reopen. Source RGB, protected preview pixels и
bbox placement проверены отдельно. Read-only comparison одновременно показывает
Changed ZTSNR/Same spacing, recorded outpaint/current img2img и frozen0.5/current
0.25 strength. Library edits не переписывают accepted settings. Legacy/relink/crash,
full component scope, качество и Invoke pixel parity этим bounded256×256/three-step
evidence не закрываются. Статус «Пока не обещать» сохранён.

Предшествующий installed NoobAI author checkpoint (07.10.2026): [Installed NoobAI author-recipe qualification](./engineering/phase-2c-noobai-author-recipe-research.md)
подтверждает exact выбранный checkpoint, фактические prediction/noise profile,
sampler, steps, CFG и dimensions через настоящий Generate/Add/Save, независимый
readback, reopen и comparison. Library ZTSNR edit не переписывает accepted
profile; сравнение показывает Changed ZTSNR и Same spacing. Recipe README/SHA
живут в qualification fixture/report, а не становятся новым `.igs` provenance
полем. Есть два source-grounded 832×1216/28-step results; V recipe — upstream
NoobAI guidance на credited Cyberfalafel, leading — явно отмеченное предположение.
Legacy/relink/crash и полный component/outpaint scope этим срезом не расширены;
качество и Invoke pixel parity не доказаны. Статус «Пока не обещать» сохранён.

Предшествующий noise-profile срез (07.10.2026):
[exact-file ZTSNR/spacing](./engineering/phase-2c-noise-profile-research.md)
реализованы в Model Manager, Main SQLite policy, frozen execution/Retry и
portable accepted configuration/read-only comparison. Defaults false/leading
отмечены как assumptions; old accepted absence остаётся Unavailable. Worker0.14
применяет native beta/timestep semantics; DPM++ SDE + ZTSNR отказывает явно.
На этом CPU/controlled transport/storage checkpoint trained NoobAI author
recipe и release ещё не были квалифицированы. Статус «Пока не обещать» сохранён; исторические checkpoints
ниже описывают границы своего времени.

Текущий v-prediction срез (07.10.2026): [Installed Illustrious v-prediction qualification](./engineering/phase-2c-installed-v-prediction-research.md)
подтверждает четыре finite completions через public Generate, installed worker
0.12.0 и явный Add/Save/readback/reopen/comparison. Accepted record хранит exact
checkpoint и frozen prediction type; после UI смены library type comparison
показывает `Changed`, не переписывает provenance или сохранённый `.igs`.
Matched txt2img и common-source img2img при strength 0.5 сохраняют одинаковые
inputs/target после исключения только prediction interpretation и document
identity/revision; decoded pixels различаются. В каждом img2img наблюдались
два denoising evaluations из трёх requested steps. Actual installed
forced-epsilon mutation завершила два здоровых txt2img случая и была остановлена
causal pixel assertion; восстановление всех 43 worker source files и настоящий
startup/physical exit проверены отдельно. Это bounded development evidence при
256×256/seed `0`/Euler a/Embedded FP32/LoRA −0.5, без ZTSNR/trailing full recipe,
quality, других installed samplers, v-outpaint, public network install или
release claims. Статус «Пока не обещать» сохраняется.

Текущий embedding срез (07.10.2026): [Installed Illustrious embedding qualification](./engineering/phase-2c-installed-embeddings-research.md)
подтверждает восемь finite completions через actual editor/installed worker и
явный Add/Save/readback/reopen/comparison. Exact trained IllustriousPhoto by
CautionMergeAhead и labeled artificial zero control сохраняют concrete literal
text и deduplicated refs отдельно для обеих полярностей; weighted/repeated
literal occurrences не создают лишних sidecars. После actual Cancel, UI library
Default change и удаления всех current literals frozen Retry сохраняет original
trained prompts/refs/target/seed `0`/Embedded FP32. Portable accepted records
исключают model paths и private aliases; comparison показывает recorded refs
как `Removed` против current empty refs, known empty — как `Same`. Matched
positive/negative txt2img и common-source img2img strength 0.5 меняют pixels при
смене только exact trained/control weights; два native denoising evaluations
наблюдались в каждом img2img случае. Это bounded development evidence при
256×256/трёх requested steps/LoRA −0.5, без independent CLIP L/G или attention
ablation, dynamic multi-job/preset/Anima, format/quality или release claims.
Статус «Пока не обещать» сохраняется.

Текущий внешний VAE срез (07.10.2026): [Installed external VAE qualification](./engineering/phase-2c-installed-external-vae-research.md)
подтверждает восемь finite FP32 completions через явный Add/Save/readback/reopen/
comparison. Recorded exact VAE либо известный Embedded сохраняются отдельно
от текущего draft; native Retry остаётся frozen после UI Default/Reset.
Exact LDM/native воспроизводят pixels Embedded в txt2img и common-source
img2img при strength 0; combined искусственный control меняет pixels.
Nonzero denoising, independent encoder/decoder ablation, другие installed options
и release остаются открытыми; статус «Пока не обещать» не повышается.

Текущий precision срез (07.10.2026): [Installed VAE precision qualification](./engineering/phase-2c-installed-vae-precision-research.md)
проверяет шесть Illustrious Embedded VAE случаев Auto/FP32/FP16 × txt2img/opaque
img2img на настоящем installed worker: 6 finite completions, 0 точных
non-finite refusals и один canceled original перед frozen FP32 Retry.
Matched txt2img Auto/FP32 дают одинаковые decoded pixels; opaque случаи
проверяют encode/decode wiring, а не matched numerical ablation. Accepted
precision сохраняется после явного Add/Save/reopen и отличается от текущего
FP16/FP32 draft в comparison. Другие installed model/options
cases и release lifecycle остаются открытыми; статус «Пока не обещать».

Текущий outpaint срез (07.10.2026): [public Generate/frozen Retry](./engineering/phase-2c-public-outpaint-research.md)
подключены для обеих семей при qualified worker 0.12.0 и exact local LaMa.
Installed development Electron завершил шесть trained cases при 256×256/трёх
шагах: у каждой семьи normal source, mixed-alpha Generate и frozen Retry после
actual Cancel. Explicit Add/Save/reopen и outpaint comparison сохраняют source
layers, exact contribution alpha и portable provenance без local paths.
Статус обещания остаётся «Пока не обещать»; setup/release и прочие MVP gaps
перечислены в research note. Последующие описания прежних checkpoints
сохраняют исторические границы evidence, а не отменяют этот более новый срез.

**Продуктовый статус:** принято как обязательный MVP scope.

**Публичный статус:** пока не обещать как готовую возможность. Production
Electron принимает выбранные проверенные Illustrious `txt2img` и opaque `img2img` candidates через
[явный Add Raster](./engineering/phase-2b-raster-acceptance-research.md): Main
сверяет frozen context и PNG, создаёт слои с immutable provenance, записывает
dirty recovery shadow до очистки staging, а явный Save переносит результат в
`.igs`. Принятые слои проходят Save/reopen и перенос файла.
Project-local Undo/Redo возвращают принятые Raster Layers вместе с immutable
provenance как одну document-операцию; история остаётся только в открытой сессии.
Read-only сравнение текущего Raster provenance подключено к production; result-to-preset остаётся в прототипе.

[Typed provenance storage](./engineering/phase-2b-accepted-provenance-storage.md)
содержит точный checkpoint/prediction type, prompts, sampling, seed и bbox без
локальных путей и Regional Guidance.
[Prepared-batch checkpoint](./engineering/phase-2b-batch-planning-research.md)
добавляет selected seed behavior в новые frozen/accepted записи и проверяет
его через Add/portable Save; legacy отсутствие поля остаётся unspecified.
[Внутренний handoff](./engineering/phase-2b-internal-handoff-and-conditioning.md)
и [GPU boundary](./engineering/phase-2b-inference-worker-research.md) проверены
отдельно. [Generate из Electron](./engineering/phase-2b-generate-actions-research.md) подключён к frozen batch admission и serial queue/staging. Release inference runtime и полный MVP
pipeline обоих семейств со всеми advanced options ещё отсутствует. Illustrious
embedding inference имеет отдельный checkpoint ниже.

[CFG Rescale checkpoint](./engineering/phase-2c-cfg-rescale-research.md)
подключает одну advanced-настройку Illustrious: production draft,
зафиксированное значение в queue/Retry, фактическое применение worker и
immutable accepted provenance со сравнением. Новые результаты сохраняют
нейтральный `0`; историческое отсутствие остаётся unknown. Локальный NVIDIA
smoke проверяет neutral equality и nonneutral pixel change отдельно от native
Electron wiring. Остальные advanced options и полный release pipeline открыты.

[Installed CFG Rescale qualification](./engineering/phase-2c-installed-cfg-rescale-research.md)
теперь проверяет actual Advanced Options → установленный trained CUDA worker →
явный Add → rendered Save/reopen/comparison. При одинаковых frozen inputs unset
и явный ноль дают одинаковые decoded RGBA pixels, 0.7 меняет их. Captured
effective zero/0.7 сохраняется в accepted record после независимой правки draft
на 0.2; сравнение показывает оба значения. Nonzero opaque img2img отдельно
подтверждает wiring/provenance, без independent img2img numerical ablation,
обещания качества или готовности остальных options/release. PP-005 остаётся
«Пока не обещать».

[Opaque img2img checkpoint](./engineering/phase-2c-img2img-research.md)
добавляет derived mode по реальному alpha, contextual denoising field и frozen
strength/source pixels через queue/Retry/worker/Add/Save/reopen/comparison.
Строгий portable record различает txt2img и img2img; старые результаты не получают
выдуманного strength. Значение 0 проходит VAE без denoising. Локальная GPU проверка
отделена от native renderer с controlled inference peer. Частичная прозрачность,
inpaint, Anima и release runtime остаются открытыми; LoRA расширены следующим
checkpoint ниже. Статус PP-005 не повышен.

[Anima prompt weighting](./features/project/generate-mode/prompt-weighting.md)
зафиксирован как обязательная часть первого Anima pipeline в фазе 2C:
совместимость с current/saved editor attention syntax, cleaned Qwen3 input,
одна полная T5 tokenization и actual weights в conditioning/denoising. Authored/
concrete weighted prompts остаются воспроизводимыми настройками. Теперь
[conditioning foundation](./engineering/phase-2c-anima-conditioning-research.md)
реализует versioned typed compiler, native offline tokenizers и веса один раз
после adapter для обеих полярностей. Cross-language/native tests, semantic
mutations и trained CPU probe проверяют эту подготовительную границу. Family-aware
editor adjustment и frozen queue/Retry/provenance остаются открытыми. Следующий
[Euler foundation](./engineering/phase-2c-anima-euler-research.md) проводит эти
веса через native denoising/Wan pixels и проверяет trained NVIDIA neutral equality,
non-neutral changes обеих полярностей, seed replay и img2img strength 0/0.5/1.
Другие schedulers/options и release не подключены; результаты helper не
публикуются в staging/provenance. Следующий
[ordinary Anima LoRA foundation](./engineering/phase-2c-anima-lora-research.md)
проверяет exact adapters до кодирования обеих полярностей, signed/zero stacks,
native tensor/scaling и восстановление graph/weights/gradient flags/RNG после
успеха и ошибки. Public queue/Retry, `.igs` provenance и wire/capability versions
не расширены. Anima Generate и публичный статус PP-005 не повышены.
[Deterministic sampling foundation](./engineering/phase-2c-anima-sampling-research.md)
добавляет internal Heun/DPM++ 2M рядом с точным Euler, fresh native history,
selected-schedule interior img2img и progress по actual evaluations. Это не
создаёт queue/Retry/accepted records. На этом checkpoint stochastic методы/LCM
и editor handoff ещё не были подключены; их последующие checkpoints описаны
ниже. Публичная проводка и release остаются открытыми; PP-005 не завершён.

[Six-method flow sampling](./engineering/phase-2c-anima-flow-sampling-research.md)
добавляет internal DPM++ 2M SDE, ER-SDE и FlowMatch LCM. Versioned TS plan
фиксирует отдельный step seed, Python использует fresh request-owned noise/history
и сохраняет weighted conditioning/signed LoRA. LCM получает once-shifted authored
grid с clipping вместо rebuilt schedule Invoke. Native/model/GPU controls
проверяют replay, strength endpoints и restoration после interruption; Base
few-step quality или Turbo support не обещаны. Public Anima admission/queue/
Retry/accepted provenance и release остаются открытыми; PP-005 не завершён.

[Anima worker entrypoint](./engineering/phase-2c-anima-worker-entrypoint-research.md)
теперь принимает compiled обе полярности и полный typed sampling plan через
actual JSONL worker 0.11.0. Captured seed domains, clipping и progress сохраняются
до provisional PNG; source/profile/hash/size и exclusive publication проверяются
в общем файловом контуре с Illustrious. Worker success ещё не создаёт durable
queue/Retry/accepted record и не расширяет `.igs`. Public Anima Generate и
статус PP-005 не повышены.

[Anima authoring](./engineering/phase-2c-anima-authoring-research.md) соединяет
нативный метод и корректное редактирование обоих prompt с mutable Project draft.
Сохранение этих полей в `.igs` не создаёт frozen accepted configuration. Main
Generate/queue/Retry/accepted Anima provenance остаются открытыми; PP-005 не завершён.

[Anima Main preparation](./engineering/phase-2c-anima-main-preparation-research.md)
фиксирует concrete обе полярности, их versioned interpretations и full native
plan на каждый seed в отдельном Main batch. Все wire envelopes проверяются до
consumer; эти contexts не являются accepted provenance или durable Retry.
На этом preparation checkpoint public Generate/queue/accepted Anima records оставались открытыми.

[Anima durable jobs](./engineering/phase-2c-anima-durable-jobs-research.md)
добавляет внутренние `anima-txt2img`/`anima-img2img` attempts, concrete weighted
prompts и полный native plan в SQLite. Retry копирует сохранённую операцию,
повторно проверяет exact checkpoint/Qwen3/VAE и ordered enabled LoRAs; dispatch
принимает только qualified worker 0.11 и фактический native progress total.
Проверенные PNG и matching receipts восстанавливаются локально, с scoped actual
seed cursor. Queue Manager показывает native method без SD sampler/prediction.
Public Project Generate и portable accepted Anima configuration пока закрыты;
Anima-only или mixed Add явно отказывается до project/journal/cancel/discard.
Это операционное хранение, а не повышение готовности PP-005.

[Исправления аудита](./engineering/product-audit-fixes.md) связывают реальный
processor → staging → Add → Save/reopen: provenance хранит проверенный actual
seed даже при отличии от planned seed; изменение staging seed без matching
completion receipt не принимается. Inference transport в этих tests подставлен.

[Project-local accepted history](./engineering/phase-2b-project-accepted-results-research.md)
показывает current generated Raster results после Add/Undo/Redo/Recover/Save/reopen:
actual seed, copied checkpoint/version/SHA, original generated size и current
signed preview. Выбор выделяет и показывает owning layer row без изменения
документа. [Saved-result SQLite index](./engineering/phase-2b-saved-accepted-index-research.md)
синхронизирует metadata generated Raster Layers из verified saved `.igs` одной
транзакцией с Home. Original output/actual seed/checkpoint сохраняются отдельно
от current asset; internal scoped query исключает unhealthy/trashed/foreign lineage.
[Global saved-result browser](./engineering/phase-2b-accepted-history-browser-research.md)
показывает сохранённые результаты из Home/Project и переходит к owning layer через
обычный Open/Recover, сохраняя dirty changes. Подписанный ресурс читает exact saved
pixels; count/page и strict IPC проверяются отдельно.
[Read-only Raster comparison](./engineering/phase-2c-raster-comparison-research.md)
открывается из меню generated слоя, включая locked слой. Portable baseline
сравнивается с текущими draft/bbox/catalog и mode по реальным composed pixels;
при недоступности CPU worker baseline остаётся доступен, mode — `Unavailable`.
Exact resource identity не заменяется именем/default version. Legacy отсутствие
LoRA/VAE/advanced options не превращается в равные defaults. Просмотр не меняет
документ, Undo, seed или `.igs`; strict IPC и async edit/Undo/close guards
проверены отдельно. Полные provenance/pipeline, result-to-preset и Smart Patch
history/comparison остаются открытыми; эти checkpoints не означают готовность
всего PP-005.

[Internal outpaint provenance (06.10.2026)](./engineering/phase-2c-outpaint-execution-research.md)
добавляет после явного Add strict portable `illustrious-outpaint` и
`anima-outpaint` records. Mode/denoising strength и actual completed seed
сохраняются вместе с captured source/keep-mask/policy/LaMa и contribution PNG/alpha8
identities без local paths, source recovery bytes или weights. Save/readback и
portable open проверяют actual RGBA asset и alpha; comparison показывает
generation configuration, сохраняя private context вне settings diff. Valid
actual uint32 seed deviation сохраняется без переписывания planned seed.
Public mixed-alpha Generate/Retry, first-setup installation и installed/release
qualification остаются открытыми. Research note содержит executed evidence и
counts; PP-005 остаётся «Пока не обещать».

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

[Illustrious LoRA checkpoint](./engineering/phase-2c-lora-research.md) добавляет
exact enabled resource/size/hash/weight в frozen queue/Retry и оба normal modes.
Accepted provenance сохраняет полный configured stack, включая disabled missing
refs; `.igs` Save/reopen и comparison отличают legacy absence от нового empty
stack. Локальная GPU проверка и Electron с controlled peer — отдельные границы.
Anima, другие adapter algorithms, remaining options и release runtime остаются
открытыми; публичный статус PP-005 не повышен.

[VAE precision checkpoint](./engineering/phase-2c-vae-precision-research.md)
добавляет Auto/FP16/FP32 встроенного Illustrious VAE в оба normal modes. Новые
jobs фиксируют policy, accepted metadata сохраняет её после Add/Save/reopen,
а comparison оставляет legacy отсутствие Unknown. Worker применяет precision
к encode и decode; non-finite VAE завершается ошибкой до публикации PNG.
Полный pipeline и публичная готовность PP-005 остаются открытыми.

[External VAE inference](./engineering/phase-2c-external-vae-inference-research.md)
фиксирует exact внешний VAE или explicit Embedded в обоих normal modes. Accepted
metadata переносит только portable identity; поздняя смена Project/Default и Retry
не меняют запись. Add/Save/reopen/comparison различают missing resources и legacy
omission; отсутствие старого поля не превращается в Embedded. Полный pipeline
и result-to-preset остаются открытыми.

[Embedding provenance](./engineering/phase-2c-embedding-inference-research.md)
сохраняет concrete literal text и effective positive/negative refs в existing
accepted v1 fields через Add, Undo/recovery и Save/reopen. Inactive choices,
raw dynamic templates, local paths и private aliases исключены. Comparison
проверяет portable identity/missing state; historical empty refs не дополняются.
Result-to-preset, Anima и полный MVP pipeline остаются открытыми; PP-005 не завершён.

[Accepted Anima records](./engineering/phase-2c-anima-public-generation-research.md) расширяют strict portable v1 отдельными
`anima-txt2img` / `anima-img2img` kinds: raw weighted signs, exact original
bundle identities/sizes, native method, actual seed, applied strength, complete
configured LoRAs и optional explicit neutral policies. Paths, compiled arrays,
SD sampling и Regional Guidance отсутствуют; legacy Illustrious shapes точны.
Add/Undo/recovery/Save/reopen и portable copy сохраняют immutable baseline;
семейный read-only comparison явно различает missing/unsupported current
settings и Same. Preset-from-result, Smart Patch и release proof остаются
открытыми; публичный статус PP-005 не повышается.

[Installed CPU ownership](./engineering/phase-2c-installed-runtime-qualification-research.md)
подключает target/comparison reads к установленному derivatives runtime через
Main owner; unavailable worker или неподтверждённый выход не заменяются
текущими defaults. Финальные четыре trained UI сценария в изолированном
installed development runtime подтверждают exact frozen inputs, actual seed
`0` и его Reuse, signed LoRA, raw weighted Anima prompts обеих полярностей и
коррелированные native Euler plans/progress. Явный Add и rendered Save/reopen
сохраняют точные output bytes и accepted configuration; existing layers не
подменяются. Native plans остаются техническим evidence, без их добавления в
portable provenance. Семейные правила comparison и исключение Regional Guidance
сохранены. Result-to-preset, все advanced options, качество моделей и release
proof остаются открытыми; PP-005 остаётся неполным.

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

[Anima authoring](./engineering/phase-2c-anima-authoring-research.md) синхронизирует
shared prototype preset editor: explicit family, native-only sampling, перенос
только заданных членов секции и сохранение source/невыбранных настроек. Это mock
редактирование и Apply в памяти, без production SQLite preset lifecycle. PP-006
остаётся неполным.

Публичный статус меняется с `пока не обещать` только после устранения prototype
gaps, перечисленных в supporting contract, и подтверждения production flow
тестами.

## PP-007: Проект принадлежит пользователю

[Phase 2A sampling/Save evidence](./engineering/phase-2a-project-storage-research.md#production-sampling-draft-controls) и [Project Undo/Redo](./engineering/phase-2b-project-undo-research.md) сохраняют отдельные references для document lifecycle и history; они не заменяют installed inference qualification.

Текущий подтверждённый [Installed image uint32 MAX→0 wrap](./engineering/phase-2c-illustrious-image-seed-wrap-research.md): четыре EPS/V × IMG/normal mixed-alpha OUT; 16 admissions/completions/accepted saved layers,12 Save/reopen packages,8 wholeRGBA matches с отдельными numeric MAX/0 controls и4 same-prompt contrasts. Independent raw readback PASS (8178 checks): immutable configuration/source contexts, cursor/Save snapshots, 11 old tables и43 worker identities сохранены. Main modulo mutation:4 semantic RED,8 neighbors GREEN,12 fresh restored GREEN; 137 focused tests PASS. Только256×256/Normal N3, one pair×two/per-prompt; native1/2/cross-pair/high-bit mutation/quality/fullMVP/release не заявлены.

Предыдущий подтверждённый [Installed Illustrious/NoobAI image Random → Fixed replay](./engineering/phase-2c-illustrious-image-seed-replay-research.md): Random → numeric Fixed/per-prompt на четырёх EPS/V × common-source IMG/normal mixed-alpha OUT scopes:64 admissions/completions/accepted layers, восемь Save/reopen packages и32 wholeRGBA replay matches. Четыре оригинальных Main crypto picks наблюдены без подмены; policies Random/Fixed, concrete prompts, фактические seeds, LoRA−0.5 и source/conditioning/resources сохранены в accepted provenance (`generationConfiguration` и `layerSourceContext`). Templates/maxPrompts — только pre-admission draft/report; поздние edits остаются отдельно. Independent raw SQLite/ZIP/Pillow readback и43 unchanged installed worker identities подтверждены. Baseline-hook/seedBehavior harness mutations дали1+4 semantic RED с neighboring/fresh restored GREEN; новых trained mutations/crash jobs нет. Только256×256/Normal N3/две observed updates; quality/Invoke trained-pixel parity/fullMVP/release не заявлены. Image Reuse после crash подтверждён отдельным [finite срезом](./engineering/phase-2c-illustrious-image-reuse-crash-research.md):44 admissions/36 completions/8 APP_RESTART/36 accepted saved layers/4 Save-reopen packages,32 Reuse +4 crash wholeRGBA matches. Исходный слой, восстановленный кандидат и cursor B сохранены; setup3/1/2cancel/1accepted-unsaved исключён. Последующий finite [image MAX→0 gate](./engineering/phase-2c-illustrious-image-seed-wrap-research.md) подтвердил16 admissions/completions/accepted saved layers,12 packages и8 own numeric-control wholeRGBA matches; native1/2/cross-pair wrap не заявлены. Следующий отдельный finite cut — image cap32; counts и budgets фиксируются до запуска. Image cap32, dynamic embedding subsets в image modes, Anima image batches, broad formats/geometry/quality/public delivery/release остаются открытыми; PP-004/005/007/008 остаются «Пока не обещать».

Предыдущий подтверждённый [Installed Illustrious/NoobAI per-prompt IMG/OUT](./engineering/phase-2c-illustrious-dynamic-image-per-prompt-research.md): Fixed0/per-prompt, четыре EPS/V × common-source IMG/normal mixed-alpha OUT scopes, четыре weighted positive×negative пары × две iterations, literal seeds0..7; 32 admissions/completions/accepted layers и четыре saved/reopened packages. Восемь first-pair0/1 wholeRGBA references совпали с прежним per-iteration gate; 16 within-pair seed contrasts проверяют только seed effect. Cross-pair prompt causality при разных seeds не заявлена. Concrete prompts, LoRA−0.5 и per-prompt settings остаются frozen в accepted configuration; исходные templates/maxPrompts сохранены в pre-admission draft/report, а не в provenance; поздние green-bowl/grainy prompts, Fixed37/per-iteration, maxPrompts3 и LoRA−0.25 сохраняются отдельно в current draft. Полная OUT source-over композиция проверена; все 43 native worker source identities и application bundles неизменны, старые reports/source hashes сохранены с явной lineage четырёх qualification helpers. Новых trained mutation/crash jobs нет. Executed details и ограничения — в новом research note.

Предыдущий подтверждённый [Installed Illustrious/NoobAI dynamic IMG/OUT](./engineering/phase-2c-illustrious-dynamic-image-research.md): EPS/V common-source IMG/normal mixed-alpha OUT, Fixed0/per-iteration, four weighted positive×negative pairs×2 iterations. Исправленный frozen R2 plan получил independent finite reader PASS (10833 checks): 48 admissions/completions, 40 accepted layers, 8 saved/reopened packages; 4 seed1 numerical RED до Add, 4 seed0 wholeRGBA neighbor GREEN, 8 fresh restored wholeRGBA matches и 48 same-seed prompt contrasts. Четыре OUT previews сохранили soft alpha и 222208 protected-source pixels; restoration всех 43 source identities проверен независимо. Первый исключённый EPS IMG attempt дал 8 admissions/completions/accepted layers и отдельный пакет, но остался failed на неверном all-visible ожидании: Add показывает только выбранный anchor. Qualifier явно показывает остальные variants перед Save; sticky verification failure исправлен только в test harness, production behavior не менялся. Qualified 48/40 отделены от raw 56 completions/48 accepted с первым failed attempt; его пакет не входит в qualified 8. Один control report сохраняет cleanup ENODEV; отдельные source-bound PID/start/cgroup closure supplements подтверждают native/launcher exits, cleanup race не считается numerical RED. Finite gate подтверждён: fresh system proof (820 checks), env/cwd guard sensitivity (точный original refusal, isolated predicate mutation RED, fresh original PASS) и guarded cleanup завершены — R0 9 paths/9117696 allocated B, R2 7 paths/7651328 allocated B; все 43 original source identities сохранены. ENODEV repair применён после original-source reader/cleanup: isolated actual two-file copy дала 30 baseline GREEN, 4 semantic RED/26 neighbor GREEN и 30 fresh restored GREEN; inode/mode/mtime/SHA восстановлены точно, без ML reruns; PP-004/005/007/008 остаются «Пока не обещать». На этом историческом checkpoint image Random/Reuse/wrap/cap32/crash, dynamic embedding subsets в image modes и Anima image batches оставались открытыми; завершённый Random-follow-up описан выше. FullMVP/quality/Invoke trained-pixel parity/public delivery/release не заявлены; PP-004/005/007/008 остаются «Пока не обещать». Этот ранее предложенный Random → Fixed replay теперь подтверждён отдельным [Installed Illustrious/NoobAI image Random → Fixed replay](./engineering/phase-2c-illustrious-image-seed-replay-research.md). Image Reuse после crash подтверждён отдельным [finite срезом](./engineering/phase-2c-illustrious-image-reuse-crash-research.md):44 admissions/36 completions/8 APP_RESTART/36 accepted saved layers/4 Save-reopen packages,32 Reuse +4 crash wholeRGBA matches. Исходный слой, восстановленный кандидат и cursor B сохранены; setup3/1/2cancel/1accepted-unsaved исключён. Последующий finite [image MAX→0 gate](./engineering/phase-2c-illustrious-image-seed-wrap-research.md) подтвердил16 admissions/completions/accepted saved layers,12 packages и8 own numeric-control wholeRGBA matches; native1/2/cross-pair wrap не заявлены. Следующий отдельный finite cut — image cap32; counts и budgets фиксируются до запуска. Image cap32, dynamic embedding subsets в image modes, Anima image batches, broad formats/geometry/quality/public delivery/release остаются открытыми; PP-004/005/007/008 остаются «Пока не обещать».

Предыдущий [Installed NoobAI multiple-LoRA IMG/OUT](./engineering/phase-2c-noobai-lora-stack-image-research.md): EPS/V common-source IMG/normal mixed-alpha OUT:22 admissions/completions,18 accepted Save/reopen/comparisons. Exact configured/effective AB/BA, B-enabled-zero/B-disabled; Digital Art A−0.5/Lineless B+0.75, ordinary unweighted prompts, external VAE FP32. Normal N3/CFG5/Fixed0/strength0.5 даёт2 actual updates. Один EPS resource-weight-swap cycle даёт2 visible-RGB/composite RED до Add,2 disabled-neighbor fullRGBA GREEN и2 fresh restored;4 provisional controls/0 mutant acceptance. В четырёх healthy objective/mode scopes zero и disabled совпадают в completeRGBA; nonzero B меняет visible output, без требования AB/BA pixel inequality. Четыре bounded native probes проверяют16 captured ordered stack handoffs и24 independent low-rank algebra variants,без дополнительных image jobs. Independent raw SQLite/ZIP/full source-over preview,43 original source identities и final physical idle PASS. Только256×256 и declared sources/grids; installed V weight-swap pixel causality не заявлена. Historical Karras TXT wrong-EPS pixel RED остаётся gap. FullMVP/quality/Invoke trained-pixel parity/public delivery/release не заявлены. На этом multiple-LoRA checkpoint dynamic common-source IMG/normal OUT ещё был открыт; текущая qualification описана отдельно. Broad formats/quality/release остаются gap.

Предыдущий [Installed NoobAI signed embedding IMG/OUT](./engineering/phase-2c-noobai-embedding-image-polarity-research.md): EPS/V common-source IMG/normal mixed-alpha OUT:18 admissions/completions,13 accepted Save/reopen/comparisons. Normal N3/CFG5/Fixed0/strength0.5 даёт2 actual updates; exact trained/zero versions в обеих полярностях. Один EPS signed-resource-swap cycle даёт4 directional visible-RGB/composite RED: mutant fullRGBA совпадает с противоположным healthy; ordinary EPS IMG neighbor fullRGBA GREEN,4 fresh restored,5 provisional controls/0 mutant acceptance. Четыре bounded native probes дают16 independent assignments и128 hidden/pooled tensor+handoff matches, branch isolation,0 extra image jobs. Independent raw SQLite/ZIP/full source-over preview,43 original source identities и final physical idle PASS. Только256×256, one literal per polarity,Digital Art−0.5/externalVAE FP32/declared sources; V sign-swap pixel causality не заявлена. Historical Karras TXT wrong-EPS pixel RED остаётся gap. FullMVP/quality/Invoke trained-pixel parity/public delivery/release не заявлены. Последующий multiple-LoRA image checkpoint описан отдельно.

Предыдущий [Installed NoobAI V DPM++ 2M IMG/OUT](./engineering/phase-2c-noobai-vpred-dpm-image-research.md): V/true-ZTSNR/leading Normal/Karras common-source IMG/normal OUT:16 admissions/completions,10 accepted Save/reopen/comparisons. N4 оставляет2 neighbor/3 history updates; один history-reset cycle даёт4 visible-RGB/composite RED,2 fullRGBA GREEN,4 fresh restored,0 mutant acceptance. Independent raw SQLite/ZIP/full source-over preview,43 original source identities и final physical idle PASS. Только256×256/N4/CFG4/Fixed0/LoRA−0.5/externalVAE FP32/declared cutoffs; historical Karras TXT wrong-EPS pixel RED остаётся gap. FullMVP/quality/Invoke trained-pixel parity/public delivery/release не заявлены. Последующий signed embedding image checkpoint описан отдельно.

Предыдущий [Installed NoobAI V DPM++ 2M TXT](./engineering/phase-2c-noobai-vpred-dpm-research.md): Normal/Karras при true-ZTSNR/leading. 8 actual admissions, 7 completions, 5 accepted saved/reopened packages и owning comparisons; Normal wrong-EPS даёт pixel RED до Add, EPS neighbor сохраняет pixels. Karras wrong-EPS отказал до candidate; отдельный bounded replay воспроизвёл UNet NaN, но исходный traceback утрачен и Karras pixel RED не доказан. Оба fresh V restored воспроизводят completeRGBA; два protected cycles восстанавливают43 source bytes/identities, 0 mutant acceptance, independent raw aggregate и final physical idle подтверждены. Только256×256/N4/CFG4/Fixed0/LoRA−0.5/externalVAE FP32. First baseline combined peak/launcher exit неизвестны; остальные семь cases measured. FullMVP/quality/Invoke trained-pixel parity/public delivery/release не заявлены. Последующий bounded IMG/OUT срез описан отдельно.

Предыдущий [Installed five-sampler campaign](./engineering/phase-2c-sampler-campaign-research.md): Anima DPM++ 2M SDE/ER-SDE/LCM IMG/OUT и EPS Illustrious-family DPM++ 2M/SDE Normal/Karras TXT/IMG/OUT. 68 finite admissions/completions, 43 accepted saved/reopened packages и owning comparisons; 25 provisional controls дают18 numerical RED до Add и7 неизменённых neighbor GREEN, 0 mutant acceptance. Все18 fresh restored cases воспроизводят completeRGBA; 14 accepted OUT packages сохраняют contribution alpha, source и полный независимый merged preview. Все пять mutations восстанавливают43 installed source bytes/identities; independent aggregate 19102 checks и final physical exit подтверждены. Только256×256/CFG4/Fixed0/LoRA−0.5 и declared finite grids. FullMVP/public statuses/quality/release остаются открытыми. На этом campaign V DPM++ 2M profile interaction ещё был открыт; последующий bounded TXT срез описан отдельно.

Предыдущий [Installed Anima DPM++ 2M IMG/OUT](./engineering/phase-2c-anima-dpmpp2m-image-research.md): 8 admissions/completions, 5 accepted saved/reopened packages и owning comparisons, с отдельным неизменённым source layer. При authored4 neighbor IMG strength0.5 выполняет2 first-order updates; history IMG/OUT strength0.75 —3 updates с second-order history. Installed history reset: neighbor IMG pixels GREEN, history IMG/OUT RGB RED до Add (alpha неизменна; IMG 65395 / OUT 25794 видимых changed pixels), 0 mutant accepted. Exact43-file bytes/identity restoration и fresh IMG/OUT fullRGBA replay; independent aggregate 2753 checks, полный affine/source-over preview. Только256×256/CFG4/Fixed0/Myth−0.5; fullMVP/release status неизменен. На этом DPM++ 2M checkpoint следующий SDE IMG/OUT gate ещё был открыт; позднейший five-sampler campaign закрывает выбранные finite cases.

Предыдущий [Installed Anima Heun IMG/OUT](./engineering/phase-2c-anima-heun-image-research.md): 5 admissions/completions, 3 accepted saved/reopened packages и owning comparisons, отдельный неизменённый source layer в каждом. Heun4/strength0.5 даёт3 evaluations. Installed premature-mask mutation: IMG pixels GREEN / OUT visible RGB RED до Add (alpha неизменна, 25819 изменённых видимых пикселей), 0 mutant accepted. Exact43-file restoration и fresh OUT rawRGBA replay, independent aggregate 2578 checks; полный affine/source-over preview проверен. Только256×256/CFG4/Fixed0/Myth−0.5, fullMVP/release status неизменен. На этом Heun checkpoint DPM++ 2M IMG/OUT ещё был открыт; его завершённый follow-up записан выше.

Предыдущий [installed Anima ER-SDE order3 checkpoint](./engineering/phase-2c-anima-er-sde-order3-research.md)
подтвердил five-step TXT и three-step neighboring control: 5 admissions и
5 finite completions, 3 accepted saved/reopened packages и owning comparisons.
Отключение только installed dd_x0 correction сохраняет three-step pixels и
меняет five-step pixels до Add; оба controls имеют 0 accepted layers.
Восстановлены все 43 исходных bytes/inode/mode/mtime; fresh five-step результат
совпал по пикселям. Independent raw aggregate: 1750 checks, PASS. Прежняя попытка
с ошибкой cleanup учтена отдельно: +3 admissions/completions и +2 accepted
packages; raw totals8/8/5/5. Граница — TXT256/CFG4/Fixed0/Myth−0.5;
PP-004/005/007/008 сохраняют «Пока не обещать». Heun IMG/OUT был следующим gate на этом checkpoint; он завершён в follow-up выше. Остальные image modes, полный
policy/geometry/format/quality и release остаются открытыми.

Последний [installed cap32/bounded truncation checkpoint](./engineering/phase-2c-generation-batch-cap-research.md)
проверил Anima и точные Illustrious-family EPS/V: четыре weighted positive×negative
пары × восемь iterations, Fixed0/per-iteration дают 32 native outputs без truncation;
первые три пары × две iterations, Fixed0/per-prompt дают 6 outputs с явным truncation.
Independent aggregate PASS: 114 admissions/114 finite/114 accepted saved layers,
6 accepted saved/reopened packages и 114 per-layer comparisons; все 18 selected-prefix
outputs совпали по same-input pixels с boundary indices 0,1,10,11,20,21.
Три настоящих confirmed 33-job UI refusals сохранили все 32 temporary results
и captured queue/receipts/cursor/staging/Project DTO/private shadow/saved package.
Проверены Undo/Redo availability flags; внутренний Undo stack не снимался.
Пять actual-source mutations: 204 executed tests/22 semantic failures, baseline
и fresh restored по 52/52 GREEN, 0 skipped; focused 349/349/typecheck/build GREEN.
Граница — TXT 256×256/три steps; полный policy/mode matrix, non-Euler IMG/OUT,
форматы/геометрия/качество/public delivery/release и full MVP остаются открытыми.
На этом checkpoint ER-SDE order3 ещё оставался открытым; bounded follow-up описан выше.
Статус «Пока не обещать» сохранён; прежние counts ниже относятся к своим checkpoint.

Предыдущий [installed Random/uint32 seed checkpoint](./engineering/phase-2c-generation-seed-boundary-research.md)
проверил Anima и точные Illustrious-family EPS/V через настоящие renderer/Main,
installed worker 0.14, Add/Save/readback/reopen и 42 сравнения принятых слоёв. Для
каждого objective наблюдался один оригинальный Main cryptographic Random base;
Fixed numeric replay воспроизвёл same-input pixels, per-prompt wrap дал MAX/0/1/2,
а fresh MAX/0 после exact restoration воспроизвёл healthy wrap pixels. Три
installed high-bit RNG mutations дали pixel RED до Add/0 accepted mutant layers.
Поздние queue строки не служили источником ожидаемых seeds; requested policy,
actual seed и selected behavior сохранились в portable provenance после current
prompt/sampler/seed 37/LoRA/dynamic edits.

Independent raw SQLite/ZIP/Pillow aggregate PASS (15,006 checks): 54 qualified admissions,
45 finite outputs (36 normal, 3 provisional mutant, 6 fresh), 42 accepted saved layers
в 12 reopened packages и 9 APP_RESTART. Raw 58 admissions/49 outputs/46 saved layers/
13 packages/9 cancellations отдельно включают прежний healthy EPS Random 4/4/4/1,
не входящий в uniform current-source matrix. Два исключённых setup 0/0 не являются
semantic RED. Original 302 queue rows/186 cursors/249 receipts, catalog 9/14/defaults,
восемь original sources и 43 restored worker source/assets сохранены; final physical
idleness подтверждён. Full MVP/readiness этим не закрыты. На этом прежнем срезе следующим gate был
cap 32/bounded truncation; bounded follow-up приведён выше; полный policy/mode matrix, replacement-document identity,
форматы/геометрия/качество/public delivery/release остаются открытыми.
Статус «Пока не обещать» сохранён.

Предыдущий [installed dynamic embedding checkpoint](./engineering/phase-2c-illustrious-dynamic-embeddings-research.md)
(09.10.2026) проверил full authored refs/effective native subsets у EPS/V:
ordinary, negative-only, positive-only, both. Независимый raw aggregate:
20 qualified admissions/16 completions/4 APP_RESTART,4 saved packages/12 layers;
raw24/16/8 включает отдельный resource-stop с4 jobs/0 outputs. Обе negative-vector
mutations дали numerical RED до Add при GREEN ordinary, fresh4 восстановили
pixels. Actual completion остаётся temporary до Add; Save/reopen/12 comparisons
сохраняют concrete refs и snapshot0 при удалённых live sidecars. Catalog9/14,
prior278 queue rows/source43 сохранены; новый Anima ML run не выполнен.
На этом historical checkpoint Random/uint32 оставались открытыми; отдельный
seed follow-up описан выше. Broader caps/seed-policy combinations,
formats/quality/public delivery/release и полный MVP остаются открытыми. Статус «Пока не обещать» сохранён.

Предыдущий [installed Illustrious/NoobAI dynamic checkpoint](./engineering/phase-2c-illustrious-dynamic-batch-research.md)
(09.10.2026) проверил exact EPS/V, Fixed0/per-iteration и crash-recovered local
Reuse0/per-prompt через renderer/Main/installed worker0.14 и явный Add/Save/reopen.
Независимый raw SQLite/ZIP/Pillow aggregate:58 admissions/42 completions/16
APP_RESTART,6 saved packages/38 accepted layers; один исключённый0-job selector
setup учтён отдельно. Обе generation-RNG seed-alias mutations дали causal pixel
RED до Add (4 provisional/0 accepted), после restoration —4 fresh GREEN.
Catalog9/14/defaults/prior220 queue rows и43 source/assets сохранены, physical idle
подтверждён. Новый Anima ML run этим срезом не выполнен. Его прежний gap
Random/uint32 закрыт в bounded seed follow-up выше; max32/truncation/full
Fixed-per-prompt matrix/formats/quality/public delivery/release и полный MVP
остаются открытыми. Статус «Пока не обещать» сохранён.

Предыдущий [installed Anima dynamic-batch checkpoint](./engineering/phase-2c-anima-dynamic-batch-research.md)
(09.10.2026) проверил actual positive×negative expansion, Fixed0/per-iteration8
и recovered local Reuse0/per-prompt8. Настоящий crash сохранил completed candidate0
и local cursor0 при null portable snapshot; два unfinished jobs получили
APP_RESTART. Frozen prompts/method/weights/seeds пережили current draft edits.
Normal17 completions/19 admissions, semantic noise-seed-alias2 provisional outputs
с pixel RED до Add/0 accepted и fresh restored2 GREEN дают три saved/reopened
packages/19 accepted layers со snapshots1,7,1. Независимый raw SQLite/ZIP/Pillow
aggregate отделяет29 qualified admissions от40 raw attempts и одного excluded
accepted unsaved shadow. Catalog9/14/defaults сохранён, все43 source/assets
восстановлены, physical idleness подтверждён. Illustrious/NoobAI counterpart
и отдельный seed follow-up записаны выше. Max32 native/truncation/formats/quality/
public installer/release и полный MVP остаются открытыми. Статус «Пока не обещать» сохранён.

Предыдущий [Installed Anima worker0.14 regression](./engineering/phase-2c-anima-worker-014-regression-research.md) (08.10.2026)
проверил 8 normal finite полных UI cycles в 9 admissions с одним actual Cancel:
шесть native TXT methods, Euler opaque IMG и mixed-alpha OUT через frozen Retry.
Bounded settings — 256×256, три requested steps, CFG4, fixed seed0, обычная
Myth Portrait LoRA−0.5, positive weight1.3 и negative0.7. Captured bundle, native
method, weighted prompts и signed LoRA остаются frozen после current prompt/
method/seed37/weight−0.25 edits; explicit Add/Save/readback/reopen и read-only
comparison сохраняют exact portable configuration и pixels. Heun TXT выполняет
пять evaluations; Euler IMG/OUT strength0.5 — два.

Installed token-weight omission сохранила correct frozen inputs и дала один
finite provisional completed candidate, затем same-input pixel RED до Add:
0 accepted mutant layers/0 saved mutant cycles. Raw native cleanup превысил
свой deadline. Protected restoration независимо проверила physical idle
и восстановила все43 original worker sources; поздний bounded proof отдельно
подтвердил exit с сохранением исходных cleanup errors. Fresh Euler TXT/IMG/OUT3 полных
cycles воспроизводят healthy same-choice pixels. Всего подтверждены11 saved/
reopened accepted packages и13 new admissions; candidate mutation не добавляется
к accepted count. Catalog9 resources/14 versions сохраняет prior6/10/defaults:
четыре managed files приняты в отдельном initial0-job UI setup, добавлены только
три owners и Anima version существующего Cyberfalafel CivitAI resource.

На этом историческом checkpoint dynamic multi-job/seed/crash Reuse оставались
открытыми; следующий bounded Anima checkpoint записан выше. Non-Euler IMG/OUT, ER-SDE order3, arbitrary formats,
качество/Invoke author recipe/public delivery/release и полный MVP этим bounded
срезом не квалифицированы; статус «Пока не обещать» сохранён. Предыдущие checkpoint
counts и historical limits ниже не расширяются.

Отдельный [installed multiple-LoRA UI checkpoint](./engineering/phase-2c-noobai-lora-stack-ui-research.md)
подтвердил 8 normal EPS/V TXT cycles в 8 admissions: AB, BA, B-enabled-zero и
B-disabled на objective, 256×256/три steps/seed0, native external VAE/FP32.
Exact Digital Art−0.5/Lineless+0.75 выбираются через настоящий UI; remove/re-add
задаёт порядок без отдельного reorder control. Полный configured stack и ordered
enabled subset остаются frozen после live reorder/weight edits. Explicit Add и
Save/readback/reopen сохраняют exact portable identities, порядок, enabled/weight
и текущий draft. UI comparison проверяет ordered name/version/SHA/enabled/weight;
CivitAI IDs независимо проверены в portable provenance, без утверждения о проверке
каждого rendered description field. B-zero и B-disabled дают одинаковые pixels;
AB и BA отличаются от этих controls, без требования pixel relation между AB/BA.
Strict catalog6/10 сохраняет исходные девять versions: единственная adoption
171,540,060-byte Lineless выполнена в отдельном setup; normal и fresh runs добавили
0 managed files. Installed weight-swap дал causal same-input pixel RED на первом
finite AB candidate до Add: 1 provisional completion, 0 accepted layers и
0 полных saved cycles. После physical exit восстановлены43 original inode/mode/
mtime/bytes, backup отсутствует; fresh restored EPS4 GREEN воспроизводит все четыре
healthy same-choice pixels, physical native exit подтверждён. Independent SQLite/
raw ZIP/Pillow aggregate проверил 12 qualified saved cycles/packages (8 normal+
4 fresh), точные receipts/pixels/ordered tuples; 14 total admissions включают ещё
1 provisional mutant и1 excluded saved setup partial. Все prior model/queue rows
сохранены, final Main/worker idle и43 exact sources подтверждены. Предыдущие native
algebra counts остаются отдельными. Этот historical gate предшествует bounded
Anima worker0.14 и bounded dynamic/seed checkpoints выше. Cap32/bounded truncation был открыт на этом срезе; завершённый bounded follow-up приведён выше.
Arbitrary formats/quality/Invoke parity/public delivery/release и статус
«Пока не обещать» не закрыты.

Предыдущий [native multiple-LoRA checkpoint](./engineering/phase-2c-noobai-lora-stack-native-research.md)
подтвердил12 normal EPS/V loader variants/11832 all-target observations на
half-loaded trained checkpoints: exact Digital Art−0.5 и Lineless+0.75, полный
986 targets каждого source и union986 (UNet722/CLIP1 72/CLIP2 192). Independent
source/graph mapping и temporary FP32 CPU module algebra проверяют single/AB/BA/
enabled-zero controls, source→adapter→signed weight binding и unload restoration.
Оба normal PID exits и43 original sources подтверждены. Это0 UI jobs/images/
receipts/conditioning/denoising; catalog5/9 и153 queue rows не пополняются,
source use остаётся local precondition без adoption/download/runtime copies.
Installed weight-swap mutant прошёл2 healthy single variants/1972 observations,
затем дал точный AB numeric RED. После physical child exit восстановлены43
original inode/mode/mtime/bytes, backup отсутствует; fresh EPS6 GREEN/5916
observations воспроизводит normal base SHA. Final proof подтверждает unchanged
полные catalog/queue rows5/9/153 и managed files, Main/worker idle и current
oracle SHA во всех четырёх executions. Additive A/B и B/A совпадают в пределах
FP32 tolerance; immutable stack order по-прежнему recorded setting. Этот native
checkpoint не проверял multiple-LoRA UI→queue→Add/Save/readback/reopen/comparison;
отдельный completed UI follow-up описан выше; historical native counts не расширяются.
Исторические counts и «Пока не обещать» сохранены. На этом native checkpoint
Anima0.14/dynamic/arbitrary formats/quality/Invoke parity/public delivery/release
оставались открытыми; последующий bounded Anima срез описан выше.

Предыдущий installed [embedding polarity срез](./engineering/phase-2c-noobai-embedding-polarity-research.md)
(08.10.2026) прошёл четыре finite normal EPS/V TXT UI cycles при256×256/трёх
steps, сохранив catalog5/9 без публикации файлов, exact signed Z/T,T/Z refs и
accepted frozen0 через Add/Save/readback/reopen/comparison при current draft37.
Нормальные runs не добавили Cancel/refusals. Три успешных independent native
oracles проверили12 direct hidden/pooled/handoff assignments без новых jobs.
Installed EPS sign-swap завершил два finite cycles до directional RED; physical
exit/restored43/original inode/mode/mtime/bytes/backup absence подтверждены,
fresh EPS pair2 GREEN. Final evidence независимо проверяет все8 saved packages,
Pillow pixels, actual SQLite completed rows/receipt bytes и signed refs/settings;
mutant pixels равны противоположным normal choices, fresh — своим. Physical
Main/worker idle подтверждён. Historical component/encoder/outpaint counts не
расширяются; arbitrary multiple-LoRA combinations/order, Anima0.14, dynamic, arbitrary formats/quality/
Invoke parity/release и статус «Пока не обещать» остаются прежними.

Текущий installed component срез (08.10.2026):
[Installed NoobAI components](./engineering/phase-2c-noobai-component-inference-research.md)
подтверждает 36 normal completions и отдельные два lifecycle: два restored
Retry completions, четыре admissions, две actual Cancel и шесть preserving
missing-component refusals. Реальные snapshots проверяют Project/layers/bbox,
autosave/recovery/scratch, весь generation-input parent, saved package и
queue/receipt/seed/tombstone rows. Default/component/prompt/seed edits сделаны
перед refused Retry; current seed37 не заменяет frozen0. После восстановления exact
managed files успешный Retry сохраняет original frozen context и target bytes;
все rollback завершены после подтверждённого physical inference-child exit. Add/Save/readback/
reopen/comparison сохраняют portable exact tuple и pixels. Четыре installed
EPS-txt2img component mutations дали causal RED после шести finite cases каждая;
исходник восстановлен между прогонами. Fresh restored EPS-txt2img normal прошёл
шесть finite cycles с native physical exit. Final source evidence подтверждает
idle Main/worker, byte-exact все 43 worker source files и пять restored mutation
journals без backup, включая excluded LoRA attempt; original inode/mode/mtime
сохранены. Bounded polarity follow-up описан выше; multiple-adapter order, Anima worker0.14, dynamic
batches, crash/relink expansion и release остаются открытыми. Статус
«Пока не обещать» сохранён.

Последующий [bounded VAE encoder checkpoint](./engineering/phase-2c-noobai-vae-encoder-research.md)
завершил 8 finite EPS/V TXT/strength0.5 IMG full UI cycles, сохранив исходные
catalog owners в5 resources/9 versions и actual current draft37 при frozen0.
Add/Save/independent readback/reopen/comparison сохраняют exact provenance/pixels.
Один installed EPS-img2img encode-zero mutant завершил два finite cycles до
causal RED; physical exit и восстановление всех 43 source files с original
inode/mode/mtime подтверждены. Fresh restored pair прошла два finite GREEN cycles с physical exit. Outpaint
encoder не проверялся этим TXT/IMG срезом; all-layer/formats qualification и multiple-LoRA order,
Anima worker0.14, dynamic и release остаются вне этого proof.

Отдельный [outpaint encoder checkpoint](./engineering/phase-2c-noobai-outpaint-encoder-research.md)
завершил четыре finite EPS/V normal OUT cycles в четырёх admissions при256×256,
трёх requested steps, FP32, seed0/strength0.5 и двух effective native denoising
evaluations. Две matched пары сохраняют source layers/protected source и exact
contribution alpha; visible contribution RGB и saved merged RGB меняются на
соответствующих координатах. Add/Save/independent readback/reopen/comparison
сохраняют immutable provenance при actual current draft37/frozen0. Catalog5/9
сохранён, newManagedFiles0; оба native physical exit подтверждены.
Installed EPS-OUT encode-zero mutant завершил два finite cycles до intended
visible-RGB RED; physical exit/restored43/original inode/mode/mtime подтверждены.
Fresh restored pair прошла два finite GREEN cycles с physical exit и exact
original EPS RGBA/merged pixels. Final8 OUT cycles (4 normal +2 finite mutation
cycles до causal RED +2 fresh GREEN) имеют independent Pillow saved `.igs` alpha/
protected source/corresponding visible/merged pixel proof, actual SQLite completed
rows/receipt bytes и CPU control binding ко всем frozen VAE refs. Idle Main/worker/
nativeData и восстановление43 exact files/original inode/mode/mtime/bytes без
backup подтверждены. Прежние 8 normal +2 mutation
+2 fresh TXT/IMG cases остаются отдельными; bounded polarity follow-up описан выше, multiple-LoRA order,
Anima worker0.14, dynamic, broader compatibility/quality и release открыты.
Статус «Пока не обещать» сохранён.

Предшествующий component source/Prepare срез (08.10.2026):
[NoobAI component research](./engineering/phase-2c-noobai-components-research.md).
Controlled Generate/Retry component refusals сохраняют Project, полный autosave tree, saved `.igs`, queue/receipt/seed rows и private inputs/staging/scratch. После восстановления resolver healthy Retry использует original frozen target/context и не меняет Project/shadow/package. Installed CPU component loading проверено отдельно; это не trained component portable Add/Save/reopen или полный MVP. Статус «Пока не обещать» сохранён.

Предшествующий installed NoobAI outpaint checkpoint (07.10.2026):
[Mixed-alpha outpaint qualification](./engineering/phase-2c-noobai-outpaint-research.md)
проверяет source RGB, protected merged-preview pixels, placement и сохранность
исходного слоя после Add/Save/readback/reopen. Две actual Cancel и шесть preserving
Retry refusals независимо меняют prediction/ZTSNR/spacing для EPS/V. Изначальные
queue/receipt/candidate/seed/staging/target/Project/saved bytes сохраняются; public
error — `GENERATION_INPUT_CHANGED` с безопасным объяснением. Восстановление policy
разрешает прежний frozen Retry после draft edits, без новой composition.
Component combinations оставались открытыми на этом checkpoint; последующий
bounded срез описан выше. Independent component gates, new-worker Anima regression, dynamic batches,
crash/relink expansion и release остаются открытыми. Статус «Пока не обещать» сохранён.

Предшествующий installed NoobAI author checkpoint (07.10.2026): [Installed NoobAI author-recipe qualification](./engineering/phase-2c-noobai-author-recipe-research.md)
проверяет сохранение Project draft, bbox, source layers, Undo и saved bytes при
Model Manager policy edits. Реальные Add/Save/readback/reopen сохраняют immutable
exact settings. После actual Cancel три независимых Retry изменения prediction,
ZTSNR или spacing дают отказ без queue/receipt/candidate/seed/staging/package
effects; восстановление всех полей разрешает прежний frozen Retry. При Cancel
actual seed не продвигается. Crash/reopen Reuse, dynamic batches, полный NoobAI
outpaint/component scope и release остаются открытыми; статус «Пока не обещать»
сохранён.

Предшествующий noise-profile срез (07.10.2026):
[exact-file ZTSNR/spacing](./engineering/phase-2c-noise-profile-research.md)
реализованы в Model Manager, Main SQLite policy, frozen execution/Retry и
portable accepted configuration/read-only comparison. Defaults false/leading
отмечены как assumptions; old accepted absence остаётся Unavailable. Worker0.14
применяет native beta/timestep semantics; DPM++ SDE + ZTSNR отказывает явно.
На этом CPU/controlled transport/storage checkpoint trained NoobAI author
recipe и release ещё не были квалифицированы. Статус «Пока не обещать» сохранён; исторические checkpoints
ниже описывают границы своего времени.

Текущий outpaint срез (07.10.2026): [public Generate/frozen Retry](./engineering/phase-2c-public-outpaint-research.md)
подключены для обеих семей при qualified worker 0.12.0 и exact local LaMa.
Installed development Electron завершил шесть trained cases при 256×256/трёх
шагах: у каждой семьи normal source, mixed-alpha Generate и frozen Retry после
actual Cancel. Explicit Add/Save/reopen и outpaint comparison сохраняют source
layers, exact contribution alpha и portable provenance без local paths.
Статус обещания остаётся «Пока не обещать»; setup/release и прочие MVP gaps
перечислены в research note. Последующие описания прежних checkpoints
сохраняют исторические границы evidence, а не отменяют этот более новый срез.

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
шагом на сеанс focus→blur; история не переживает закрытие проекта. На новом
[embedding authoring checkpoint](./engineering/phase-2c-embedding-authoring-research.md)
текст и exact refs составляют одну правку: Delete/Clear prune можно отменить
вместе с ref. Shadow recovery и явный Save/reopen сохраняют оба значения;
portable relink меняет только local IDs. Revision/epoch отвергают позднюю
verification, edit→Undo ABA и close, включая async commit hook.
Generation pipeline от этих authoring
actions не становится готовым.
[Anima Main preparation](./engineering/phase-2c-anima-main-preparation-research.md)
использует captured document ID/revision, leased visible pixels и scoped Reuse
cursor без изменения документа, `.igs`, queue или actual seed. Temporary request
paths принадлежат одной lease и не становятся переносимыми project assets.
Эти ephemeral contexts сами по себе не являются durable Anima pipeline.
[Durable Anima checkpoint](./engineering/phase-2c-anima-durable-jobs-research.md)
теперь сохраняет отдельные concrete attempts и verified local recovery candidates
через общие receipts/tombstones. Это не меняет `.igs` до явного принятия: portable
Anima Add ещё запрещён, как и public Generate. Discard/Cancel/Retry/restart
сохраняют документный seed и чужие sessions; capacity проверяется по фактическому
экранированному манифесту при прежних лимитах.
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

[New Generate during inference](./engineering/phase-2b-busy-generate-research.md)
удерживает frozen Project/Canvas input для CPU preparation, сохраняет close gate,
accepted layers, dirty/Undo и явную границу Save. Второй Project может поставить
batch в очередь при processing; `.igs` и actual seed не меняются. CPU startup/
request прерывается при shutdown, unconfirmed exit удерживает owner и блокирует
новые claims. Проверены реальные SQLite/files и Electron с controlled peers;
это не повышает готовность полного CUDA/release flow.

[Result sessions](./engineering/phase-2b-result-sessions-research.md) добавляют
transient preview filter без изменения global checkbox/Add scope. Hidden selected
count и полный confirmation сохраняют видимость последствий Add. Closed Queue
Open продолжает exact result focus после ordinary Open или явного Recover;
Cancel/context/close/failure отзывают одноразовое намерение. Explicit Discard
Recovery отменяет его, фиксирует tombstones всех временных результатов этого
Project, затем удаляет shadow и открывает saved `.igs`. Ошибка до фиксации
tombstones сохраняет shadow; отложенная очистка файлов показана warning.
Saved файл и его accepted assets, operational queue history, actual seed и
другие Projects сохраняются. Несохранённые правки, включая принятые слои только
в shadow, удаляются. [SQLite lock safety](./engineering/sqlite-lock-safety-research.md)
убирает raw descriptor checks: pending sibling jobs остаются видимыми после
закрытия и повторного открытия соседнего соединения; altered SQLite file
permissions требуют явного repair. Fresh read
проверяет actual document и exact job/session, без подстановки соседнего кандидата.
Filter/navigation не меняют `.igs`, dirty/Undo, bbox, actual seed, queue/staging,
accepted layers или provenance. Native proof использует реальные Electron/IPC/
SQLite/files и controlled generation fixtures; полный GPU/release flow на этом историческом checkpoint оставался открытым;
публичный статус не повышается.
[Saved-result browser](./engineering/phase-2b-accepted-history-browser-research.md)
даёт общую модалку из Home/Project и точный переход к owning accepted layer.
Saved-only SQLite/preview остаются отдельно от current dirty tab и staging;
Cancel/Discard/context change отменяют pending focus, а отсутствующий dirty layer
вызывает notice без потери правок. Навигация не добавляет/удаляет результаты и
не меняет `.igs`, seed, visibility или Undo. Read-only Raster comparison
подключён отдельным [PP-005 checkpoint](./engineering/phase-2c-raster-comparison-research.md);
Smart Patch, пресеты, полные provenance/comparison поля и полный GPU/release flow
остаются открытыми.
[Staging-only recovery](./engineering/phase-2b-staging-only-recovery-research.md)
добавляет Home/Open/Import decision для closed ready Project с verified completed
Results без dirty shadow. Recover открывает saved документ clean; Cancel не
открывает вкладку; Discard сохраняет прежний all-session scope. Недоступный
staging при absent/clean shadow показывается как unavailable с диагностикой,
сохраняя saved Open/Import/Save/rebuild и неизвестные файлы; pending document
shadow сохраняет свой статус и decision first. Fresh inspections и общий Project gate
сохраняют границы dirty recovery, acceptance и seed; это не full GPU/release proof.

[Project-local accepted history](./engineering/phase-2b-project-accepted-results-research.md)
теперь реконструирует список current accepted Raster results из owned provenance
после Add, Undo/Redo, shadow Recover и portable Save/reopen. Temporary candidates
и imported raster без provenance исключены; Queue prune и Clear Undo history не
удаляют accepted entries. Выбор записи меняет только transient layer selection/
Layers scroll. [Saved-result SQLite index](./engineering/phase-2b-saved-accepted-index-research.md)
теперь заменяет Home и accepted-result metadata одной транзакцией из verified
saved `.igs`; unsaved Add/Undo/shadow Recover и Queue prune не публикуют изменения
в нём. Отказ индекса после committed Save сохраняет `.igs`, прежний целый DB
snapshot и warning; workspace Refresh восстанавливает projection из saved source.
Internal query исключает unhealthy/trashed/foreign-lineage записи. Cross-project
history browser/navigation и public IPC пока отсутствуют, публичный статус не повышается.

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
[Queue result navigation](./engineering/phase-2b-queue-result-preview-research.md)
теперь показывает доступный candidate через свежую проверку document/job/session,
не меняя `.igs`, dirty/Undo или completed seed.
[Frozen Retry during inference](./engineering/phase-2b-busy-retry-research.md)
публикует новый frozen attempt при занятом worker без команд текущему процессу
или второго child; admission сохраняет document/close gate и отдельные `.igs`,
staging и actual seed. Будущий dispatch снова проверяет runtime и ресурсы.

[PP-007 Supporting Contract: Project Document Lifecycle](./features/project/document-lifecycle.md)
определяет Save, dirty state, close guards, shadow autosave и recovery.
[Home](./features/home-screen.md) определяет workspace import, relink и Trash,
а [Data Storage](./specs/03-data-storage.md) — пакет `.igs` и derived indexes.
Переносимость проекта не подразумевает готовый Save As flow или preset export.

[Portable accepted Anima](./engineering/phase-2c-anima-public-generation-research.md) проходит настоящий Add journal/shadow,
Undo/Redo, crash reconciliation, Recover и explicit Save/readIgsPackage/reopen.
Saved-only indexes/history и перенос копии сохраняют native provenance;
непринятые результаты остаются локальными. Package overflow отказывает до
отмены siblings и любых изменений. Seed cursor сохраняет operational ownership
и snapshot только при Save. Старые binaries не читают новые native record kinds.
Полная release qualification и PP-007 остаются незавершёнными.

[Installed Save/import routing](./engineering/phase-2c-installed-runtime-qualification-research.md)
использует app-owned CPU worker отдельно от readiness ML pipeline.
Отсутствующий/непригодный runtime сохраняет документ с обозначенными
placeholder previews. Завершённый Save сохраняет свой успешный исход при
ошибке close; retained child блокирует новые CPU/CUDA процессы до подтверждения
физического выхода. Shutdown ждёт этого подтверждения перед закрытием storage.
Реальные filesystem/SQLite и controlled lifecycle peers проверены отдельно от
финального trained UI прогона. Последний завершил четыре rendered Save/reopen
сценария обеих семей и проверил настоящую соседнюю границу: отсутствие active
runtime pointer → UI Save с placeholder без потери accepted pixels/provenance →
восстановление pointer → Home Rebuild Preview, меняющий только derivatives.
Реальный PNG также импортирован через installed CPU worker, нормализован и
сохранён без изменения прежних слоёв; OS chooser контролируется только для
выбора source file. Это isolated development runtime, без доказательства
signed installer/repair/rollback, качества моделей или fleet compatibility.
Release lifecycle и публичный статус PP-007 остаются открытыми.

[Installed CFG Save/reopen](./engineering/phase-2c-installed-cfg-rescale-research.md)
отдельно подтвердил four-case CFG путь на настоящих `.igs`: captured effective
zero/0.7 и independently edited current draft 0.2 сохраняются как разные данные.
Превью создаёт installed CPU worker; actual package loader и повторное открытие
сохраняют pixels, provenance и draft. Это здоровый development runtime на одном
Linux/NVIDIA host; missing-runtime/rebuild controls принадлежат предыдущему
checkpoint, release lifecycle и PP-007 остаются открытыми.

[Internal outpaint persistence (06.10.2026)](./engineering/phase-2c-outpaint-execution-research.md)
сохраняет независимый source PNG в staging до публикации candidate manifest,
чтобы source-bound contribution verification переживал restart и pruning
terminal queue rows. Add, grouped Undo/Redo и shadow используют прежних owners;
явный Save/readback и перенос `.igs` сохраняют RGBA contribution и immutable
provenance без локального source PNG или LaMa. Изменение source/output
отклоняется при проверке staging; неверный portable output/alpha отклоняется
до замены сохранённого файла. Непринятые candidates,
operational receipts и actual seed остаются локальными; seed snapshot входит в
`.igs` только при Save. Public mixed-alpha Generate/Retry, first-setup LaMa
installation и installed/release qualification остаются открытыми. Counts и
границы evidence находятся в research note; PP-007 не завершён.

## PP-008: Генерация меняет проект только по явному решению

[Production candidate export checkpoint](./features/project/generate-mode/generation-results.md#production-candidate-image-export-checkpoint) и [Project Undo/Redo](./engineering/phase-2b-project-undo-research.md) описывают отдельные staging/export и multi-Add history boundaries.

Текущий подтверждённый [Installed image uint32 MAX→0 wrap](./engineering/phase-2c-illustrious-image-seed-wrap-research.md): четыре EPS/V × IMG/normal mixed-alpha OUT; 16 admissions/completions/accepted saved layers,12 Save/reopen packages,8 wholeRGBA matches с отдельными numeric MAX/0 controls и4 same-prompt contrasts. Independent raw readback PASS (8178 checks): immutable configuration/source contexts, cursor/Save snapshots, 11 old tables и43 worker identities сохранены. Main modulo mutation:4 semantic RED,8 neighbors GREEN,12 fresh restored GREEN; 137 focused tests PASS. Только256×256/Normal N3, one pair×two/per-prompt; native1/2/cross-pair/high-bit mutation/quality/fullMVP/release не заявлены.

Предыдущий подтверждённый [Installed Illustrious/NoobAI image Random → Fixed replay](./engineering/phase-2c-illustrious-image-seed-replay-research.md): Random → numeric Fixed/per-prompt на четырёх EPS/V × common-source IMG/normal mixed-alpha OUT scopes:64 admissions/completions/accepted layers, восемь Save/reopen packages и32 wholeRGBA replay matches. Четыре оригинальных Main crypto picks наблюдены без подмены; policies Random/Fixed, concrete prompts, фактические seeds, LoRA−0.5 и source/conditioning/resources сохранены в accepted provenance (`generationConfiguration` и `layerSourceContext`). Templates/maxPrompts — только pre-admission draft/report; поздние edits остаются отдельно. Independent raw SQLite/ZIP/Pillow readback и43 unchanged installed worker identities подтверждены. Baseline-hook/seedBehavior harness mutations дали1+4 semantic RED с neighboring/fresh restored GREEN; новых trained mutations/crash jobs нет. Только256×256/Normal N3/две observed updates; quality/Invoke trained-pixel parity/fullMVP/release не заявлены. Image Reuse после crash подтверждён отдельным [finite срезом](./engineering/phase-2c-illustrious-image-reuse-crash-research.md):44 admissions/36 completions/8 APP_RESTART/36 accepted saved layers/4 Save-reopen packages,32 Reuse +4 crash wholeRGBA matches. Исходный слой, восстановленный кандидат и cursor B сохранены; setup3/1/2cancel/1accepted-unsaved исключён. Последующий finite [image MAX→0 gate](./engineering/phase-2c-illustrious-image-seed-wrap-research.md) подтвердил16 admissions/completions/accepted saved layers,12 packages и8 own numeric-control wholeRGBA matches; native1/2/cross-pair wrap не заявлены. Следующий отдельный finite cut — image cap32; counts и budgets фиксируются до запуска. Image cap32, dynamic embedding subsets в image modes, Anima image batches, broad formats/geometry/quality/public delivery/release остаются открытыми; PP-004/005/007/008 остаются «Пока не обещать».

Предыдущий подтверждённый [Installed Illustrious/NoobAI per-prompt IMG/OUT](./engineering/phase-2c-illustrious-dynamic-image-per-prompt-research.md): Fixed0/per-prompt, четыре EPS/V × common-source IMG/normal mixed-alpha OUT scopes, четыре weighted positive×negative пары × две iterations, literal seeds0..7; 32 admissions/completions/accepted layers и четыре saved/reopened packages. Восемь first-pair0/1 wholeRGBA references совпали с прежним per-iteration gate; 16 within-pair seed contrasts проверяют только seed effect. Cross-pair prompt causality при разных seeds не заявлена. Concrete prompts, LoRA−0.5 и per-prompt settings остаются frozen в accepted configuration; исходные templates/maxPrompts сохранены в pre-admission draft/report, а не в provenance; поздние green-bowl/grainy prompts, Fixed37/per-iteration, maxPrompts3 и LoRA−0.25 сохраняются отдельно в current draft. Полная OUT source-over композиция проверена; все 43 native worker source identities и application bundles неизменны, старые reports/source hashes сохранены с явной lineage четырёх qualification helpers. Новых trained mutation/crash jobs нет. Executed details и ограничения — в новом research note.

Предыдущий подтверждённый [Installed Illustrious/NoobAI dynamic IMG/OUT](./engineering/phase-2c-illustrious-dynamic-image-research.md): EPS/V common-source IMG/normal mixed-alpha OUT, Fixed0/per-iteration, four weighted positive×negative pairs×2 iterations. Исправленный frozen R2 plan получил independent finite reader PASS (10833 checks): 48 admissions/completions, 40 accepted layers, 8 saved/reopened packages; 4 seed1 numerical RED до Add, 4 seed0 wholeRGBA neighbor GREEN, 8 fresh restored wholeRGBA matches и 48 same-seed prompt contrasts. Четыре OUT previews сохранили soft alpha и 222208 protected-source pixels; restoration всех 43 source identities проверен независимо. Первый исключённый EPS IMG attempt дал 8 admissions/completions/accepted layers и отдельный пакет, но остался failed на неверном all-visible ожидании: Add показывает только выбранный anchor. Qualifier явно показывает остальные variants перед Save; sticky verification failure исправлен только в test harness, production behavior не менялся. Qualified 48/40 отделены от raw 56 completions/48 accepted с первым failed attempt; его пакет не входит в qualified 8. Один control report сохраняет cleanup ENODEV; отдельные source-bound PID/start/cgroup closure supplements подтверждают native/launcher exits, cleanup race не считается numerical RED. Finite gate подтверждён: fresh system proof (820 checks), env/cwd guard sensitivity (точный original refusal, isolated predicate mutation RED, fresh original PASS) и guarded cleanup завершены — R0 9 paths/9117696 allocated B, R2 7 paths/7651328 allocated B; все 43 original source identities сохранены. ENODEV repair применён после original-source reader/cleanup: isolated actual two-file copy дала 30 baseline GREEN, 4 semantic RED/26 neighbor GREEN и 30 fresh restored GREEN; inode/mode/mtime/SHA восстановлены точно, без ML reruns; PP-004/005/007/008 остаются «Пока не обещать». На этом историческом checkpoint image Random/Reuse/wrap/cap32/crash, dynamic embedding subsets в image modes и Anima image batches оставались открытыми; завершённый Random-follow-up описан выше. FullMVP/quality/Invoke trained-pixel parity/public delivery/release не заявлены; PP-004/005/007/008 остаются «Пока не обещать». Этот ранее предложенный Random → Fixed replay теперь подтверждён отдельным [Installed Illustrious/NoobAI image Random → Fixed replay](./engineering/phase-2c-illustrious-image-seed-replay-research.md). Image Reuse после crash подтверждён отдельным [finite срезом](./engineering/phase-2c-illustrious-image-reuse-crash-research.md):44 admissions/36 completions/8 APP_RESTART/36 accepted saved layers/4 Save-reopen packages,32 Reuse +4 crash wholeRGBA matches. Исходный слой, восстановленный кандидат и cursor B сохранены; setup3/1/2cancel/1accepted-unsaved исключён. Последующий finite [image MAX→0 gate](./engineering/phase-2c-illustrious-image-seed-wrap-research.md) подтвердил16 admissions/completions/accepted saved layers,12 packages и8 own numeric-control wholeRGBA matches; native1/2/cross-pair wrap не заявлены. Следующий отдельный finite cut — image cap32; counts и budgets фиксируются до запуска. Image cap32, dynamic embedding subsets в image modes, Anima image batches, broad formats/geometry/quality/public delivery/release остаются открытыми; PP-004/005/007/008 остаются «Пока не обещать».

Предыдущий [Installed NoobAI multiple-LoRA IMG/OUT](./engineering/phase-2c-noobai-lora-stack-image-research.md): EPS/V common-source IMG/normal mixed-alpha OUT:22 admissions/completions,18 accepted Save/reopen/comparisons. Exact configured/effective AB/BA, B-enabled-zero/B-disabled; Digital Art A−0.5/Lineless B+0.75, ordinary unweighted prompts, external VAE FP32. Normal N3/CFG5/Fixed0/strength0.5 даёт2 actual updates. Один EPS resource-weight-swap cycle даёт2 visible-RGB/composite RED до Add,2 disabled-neighbor fullRGBA GREEN и2 fresh restored;4 provisional controls/0 mutant acceptance. В четырёх healthy objective/mode scopes zero и disabled совпадают в completeRGBA; nonzero B меняет visible output, без требования AB/BA pixel inequality. Четыре bounded native probes проверяют16 captured ordered stack handoffs и24 independent low-rank algebra variants,без дополнительных image jobs. Independent raw SQLite/ZIP/full source-over preview,43 original source identities и final physical idle PASS. Только256×256 и declared sources/grids; installed V weight-swap pixel causality не заявлена. Historical Karras TXT wrong-EPS pixel RED остаётся gap. FullMVP/quality/Invoke trained-pixel parity/public delivery/release не заявлены. На этом multiple-LoRA checkpoint dynamic common-source IMG/normal OUT ещё был открыт; текущая qualification описана отдельно. Broad formats/quality/release остаются gap.

Предыдущий [Installed NoobAI signed embedding IMG/OUT](./engineering/phase-2c-noobai-embedding-image-polarity-research.md): EPS/V common-source IMG/normal mixed-alpha OUT:18 admissions/completions,13 accepted Save/reopen/comparisons. Normal N3/CFG5/Fixed0/strength0.5 даёт2 actual updates; exact trained/zero versions в обеих полярностях. Один EPS signed-resource-swap cycle даёт4 directional visible-RGB/composite RED: mutant fullRGBA совпадает с противоположным healthy; ordinary EPS IMG neighbor fullRGBA GREEN,4 fresh restored,5 provisional controls/0 mutant acceptance. Четыре bounded native probes дают16 independent assignments и128 hidden/pooled tensor+handoff matches, branch isolation,0 extra image jobs. Independent raw SQLite/ZIP/full source-over preview,43 original source identities и final physical idle PASS. Только256×256, one literal per polarity,Digital Art−0.5/externalVAE FP32/declared sources; V sign-swap pixel causality не заявлена. Historical Karras TXT wrong-EPS pixel RED остаётся gap. FullMVP/quality/Invoke trained-pixel parity/public delivery/release не заявлены. Последующий multiple-LoRA image checkpoint описан отдельно.

Предыдущий [Installed NoobAI V DPM++ 2M IMG/OUT](./engineering/phase-2c-noobai-vpred-dpm-image-research.md): V/true-ZTSNR/leading Normal/Karras common-source IMG/normal OUT:16 admissions/completions,10 accepted Save/reopen/comparisons. N4 оставляет2 neighbor/3 history updates; один history-reset cycle даёт4 visible-RGB/composite RED,2 fullRGBA GREEN,4 fresh restored,0 mutant acceptance. Independent raw SQLite/ZIP/full source-over preview,43 original source identities и final physical idle PASS. Только256×256/N4/CFG4/Fixed0/LoRA−0.5/externalVAE FP32/declared cutoffs; historical Karras TXT wrong-EPS pixel RED остаётся gap. FullMVP/quality/Invoke trained-pixel parity/public delivery/release не заявлены. Последующий signed embedding image checkpoint описан отдельно.

Предыдущий [Installed NoobAI V DPM++ 2M TXT](./engineering/phase-2c-noobai-vpred-dpm-research.md): Normal/Karras при true-ZTSNR/leading. 8 actual admissions, 7 completions, 5 accepted saved/reopened packages и owning comparisons; Normal wrong-EPS даёт pixel RED до Add, EPS neighbor сохраняет pixels. Karras wrong-EPS отказал до candidate; отдельный bounded replay воспроизвёл UNet NaN, но исходный traceback утрачен и Karras pixel RED не доказан. Оба fresh V restored воспроизводят completeRGBA; два protected cycles восстанавливают43 source bytes/identities, 0 mutant acceptance, independent raw aggregate и final physical idle подтверждены. Только256×256/N4/CFG4/Fixed0/LoRA−0.5/externalVAE FP32. First baseline combined peak/launcher exit неизвестны; остальные семь cases measured. FullMVP/quality/Invoke trained-pixel parity/public delivery/release не заявлены. Последующий bounded IMG/OUT срез описан отдельно.

Предыдущий [Installed five-sampler campaign](./engineering/phase-2c-sampler-campaign-research.md): Anima DPM++ 2M SDE/ER-SDE/LCM IMG/OUT и EPS Illustrious-family DPM++ 2M/SDE Normal/Karras TXT/IMG/OUT. 68 finite admissions/completions, 43 accepted saved/reopened packages и owning comparisons; 25 provisional controls дают18 numerical RED до Add и7 неизменённых neighbor GREEN, 0 mutant acceptance. Все18 fresh restored cases воспроизводят completeRGBA; 14 accepted OUT packages сохраняют contribution alpha, source и полный независимый merged preview. Все пять mutations восстанавливают43 installed source bytes/identities; independent aggregate 19102 checks и final physical exit подтверждены. Только256×256/CFG4/Fixed0/LoRA−0.5 и declared finite grids. FullMVP/public statuses/quality/release остаются открытыми. На этом campaign V DPM++ 2M profile interaction ещё был открыт; последующий bounded TXT срез описан отдельно.

Предыдущий [Installed Anima DPM++ 2M IMG/OUT](./engineering/phase-2c-anima-dpmpp2m-image-research.md): 8 admissions/completions, 5 accepted saved/reopened packages и owning comparisons, с отдельным неизменённым source layer. При authored4 neighbor IMG strength0.5 выполняет2 first-order updates; history IMG/OUT strength0.75 —3 updates с second-order history. Installed history reset: neighbor IMG pixels GREEN, history IMG/OUT RGB RED до Add (alpha неизменна; IMG 65395 / OUT 25794 видимых changed pixels), 0 mutant accepted. Exact43-file bytes/identity restoration и fresh IMG/OUT fullRGBA replay; independent aggregate 2753 checks, полный affine/source-over preview. Только256×256/CFG4/Fixed0/Myth−0.5; fullMVP/release status неизменен. На этом DPM++ 2M checkpoint следующий SDE IMG/OUT gate ещё был открыт; позднейший five-sampler campaign закрывает выбранные finite cases.

Предыдущий [Installed Anima Heun IMG/OUT](./engineering/phase-2c-anima-heun-image-research.md): 5 admissions/completions, 3 accepted saved/reopened packages и owning comparisons, отдельный неизменённый source layer в каждом. Heun4/strength0.5 даёт3 evaluations. Installed premature-mask mutation: IMG pixels GREEN / OUT visible RGB RED до Add (alpha неизменна, 25819 изменённых видимых пикселей), 0 mutant accepted. Exact43-file restoration и fresh OUT rawRGBA replay, independent aggregate 2578 checks; полный affine/source-over preview проверен. Только256×256/CFG4/Fixed0/Myth−0.5, fullMVP/release status неизменен. На этом Heun checkpoint DPM++ 2M IMG/OUT ещё был открыт; его завершённый follow-up записан выше.

Предыдущий [installed Anima ER-SDE order3 checkpoint](./engineering/phase-2c-anima-er-sde-order3-research.md)
подтвердил five-step TXT и three-step neighboring control: 5 admissions и
5 finite completions, 3 accepted saved/reopened packages и owning comparisons.
Отключение только installed dd_x0 correction сохраняет three-step pixels и
меняет five-step pixels до Add; оба controls имеют 0 accepted layers.
Восстановлены все 43 исходных bytes/inode/mode/mtime; fresh five-step результат
совпал по пикселям. Independent raw aggregate: 1750 checks, PASS. Прежняя попытка
с ошибкой cleanup учтена отдельно: +3 admissions/completions и +2 accepted
packages; raw totals8/8/5/5. Граница — TXT256/CFG4/Fixed0/Myth−0.5;
PP-004/005/007/008 сохраняют «Пока не обещать». Heun IMG/OUT был следующим gate на этом checkpoint; он завершён в follow-up выше. Остальные image modes, полный
policy/geometry/format/quality и release остаются открытыми.

Последний [installed cap32/bounded truncation checkpoint](./engineering/phase-2c-generation-batch-cap-research.md)
проверил Anima и точные Illustrious-family EPS/V: четыре weighted positive×negative
пары × восемь iterations, Fixed0/per-iteration дают 32 native outputs без truncation;
первые три пары × две iterations, Fixed0/per-prompt дают 6 outputs с явным truncation.
Independent aggregate PASS: 114 admissions/114 finite/114 accepted saved layers,
6 accepted saved/reopened packages и 114 per-layer comparisons; все 18 selected-prefix
outputs совпали по same-input pixels с boundary indices 0,1,10,11,20,21.
Три настоящих confirmed 33-job UI refusals сохранили все 32 temporary results
и captured queue/receipts/cursor/staging/Project DTO/private shadow/saved package.
Проверены Undo/Redo availability flags; внутренний Undo stack не снимался.
Пять actual-source mutations: 204 executed tests/22 semantic failures, baseline
и fresh restored по 52/52 GREEN, 0 skipped; focused 349/349/typecheck/build GREEN.
Граница — TXT 256×256/три steps; полный policy/mode matrix, non-Euler IMG/OUT,
форматы/геометрия/качество/public delivery/release и full MVP остаются открытыми.
На этом checkpoint ER-SDE order3 ещё оставался открытым; bounded follow-up описан выше.
Статус «Пока не обещать» сохранён; прежние counts ниже относятся к своим checkpoint.

Предыдущий [installed Random/uint32 seed checkpoint](./engineering/phase-2c-generation-seed-boundary-research.md)
проверил Anima и точные Illustrious-family EPS/V через настоящие renderer/Main,
installed worker 0.14, Add/Save/readback/reopen и 42 сравнения принятых слоёв. Для
каждого objective наблюдался один оригинальный Main cryptographic Random base;
Fixed numeric replay воспроизвёл same-input pixels, per-prompt wrap дал MAX/0/1/2,
а fresh MAX/0 после exact restoration воспроизвёл healthy wrap pixels. Три
installed high-bit RNG mutations дали pixel RED до Add/0 accepted mutant layers.
Поздние queue строки не служили источником ожидаемых seeds; requested policy,
actual seed и selected behavior сохранились в portable provenance после current
prompt/sampler/seed 37/LoRA/dynamic edits.

Independent raw SQLite/ZIP/Pillow aggregate PASS (15,006 checks): 54 qualified admissions,
45 finite outputs (36 normal, 3 provisional mutant, 6 fresh), 42 accepted saved layers
в 12 reopened packages и 9 APP_RESTART. Raw 58 admissions/49 outputs/46 saved layers/
13 packages/9 cancellations отдельно включают прежний healthy EPS Random 4/4/4/1,
не входящий в uniform current-source matrix. Два исключённых setup 0/0 не являются
semantic RED. Original 302 queue rows/186 cursors/249 receipts, catalog 9/14/defaults,
восемь original sources и 43 restored worker source/assets сохранены; final physical
idleness подтверждён. Full MVP/readiness этим не закрыты. На этом прежнем срезе следующим gate был
cap 32/bounded truncation; bounded follow-up приведён выше; полный policy/mode matrix, replacement-document identity,
форматы/геометрия/качество/public delivery/release остаются открытыми.
Статус «Пока не обещать» сохранён.

Предыдущий [installed dynamic embedding checkpoint](./engineering/phase-2c-illustrious-dynamic-embeddings-research.md)
(09.10.2026) проверил full authored refs/effective native subsets у EPS/V:
ordinary, negative-only, positive-only, both. Независимый raw aggregate:
20 qualified admissions/16 completions/4 APP_RESTART,4 saved packages/12 layers;
raw24/16/8 включает отдельный resource-stop с4 jobs/0 outputs. Обе negative-vector
mutations дали numerical RED до Add при GREEN ordinary, fresh4 восстановили
pixels. Actual completion остаётся temporary до Add; Save/reopen/12 comparisons
сохраняют concrete refs и snapshot0 при удалённых live sidecars. Catalog9/14,
prior278 queue rows/source43 сохранены; новый Anima ML run не выполнен.
На этом historical checkpoint Random/uint32 оставались открытыми; отдельный
seed follow-up описан выше. Broader caps/seed-policy combinations,
formats/quality/public delivery/release и полный MVP остаются открытыми. Статус «Пока не обещать» сохранён.

Предыдущий [installed Illustrious/NoobAI dynamic checkpoint](./engineering/phase-2c-illustrious-dynamic-batch-research.md)
(09.10.2026) проверил exact EPS/V, Fixed0/per-iteration и crash-recovered local
Reuse0/per-prompt через renderer/Main/installed worker0.14 и явный Add/Save/reopen.
Независимый raw SQLite/ZIP/Pillow aggregate:58 admissions/42 completions/16
APP_RESTART,6 saved packages/38 accepted layers; один исключённый0-job selector
setup учтён отдельно. Обе generation-RNG seed-alias mutations дали causal pixel
RED до Add (4 provisional/0 accepted), после restoration —4 fresh GREEN.
Catalog9/14/defaults/prior220 queue rows и43 source/assets сохранены, physical idle
подтверждён. Новый Anima ML run этим срезом не выполнен. Его прежний gap
Random/uint32 закрыт в bounded seed follow-up выше; max32/truncation/full
Fixed-per-prompt matrix/formats/quality/public delivery/release и полный MVP
остаются открытыми. Статус «Пока не обещать» сохранён.

Предыдущий [installed Anima dynamic-batch checkpoint](./engineering/phase-2c-anima-dynamic-batch-research.md)
(09.10.2026) проверил actual positive×negative expansion, Fixed0/per-iteration8
и recovered local Reuse0/per-prompt8. Настоящий crash сохранил completed candidate0
и local cursor0 при null portable snapshot; два unfinished jobs получили
APP_RESTART. Frozen prompts/method/weights/seeds пережили current draft edits.
Normal17 completions/19 admissions, semantic noise-seed-alias2 provisional outputs
с pixel RED до Add/0 accepted и fresh restored2 GREEN дают три saved/reopened
packages/19 accepted layers со snapshots1,7,1. Независимый raw SQLite/ZIP/Pillow
aggregate отделяет29 qualified admissions от40 raw attempts и одного excluded
accepted unsaved shadow. Catalog9/14/defaults сохранён, все43 source/assets
восстановлены, physical idleness подтверждён. Illustrious/NoobAI counterpart
и отдельный seed follow-up записаны выше. Max32 native/truncation/formats/quality/
public installer/release и полный MVP остаются открытыми. Статус «Пока не обещать» сохранён.

Предыдущий [Installed Anima worker0.14 regression](./engineering/phase-2c-anima-worker-014-regression-research.md) (08.10.2026)
проверил 8 normal finite полных UI cycles в 9 admissions с одним actual Cancel:
шесть native TXT methods, Euler opaque IMG и mixed-alpha OUT через frozen Retry.
Bounded settings — 256×256, три requested steps, CFG4, fixed seed0, обычная
Myth Portrait LoRA−0.5, positive weight1.3 и negative0.7. Captured bundle, native
method, weighted prompts и signed LoRA остаются frozen после current prompt/
method/seed37/weight−0.25 edits; explicit Add/Save/readback/reopen и read-only
comparison сохраняют exact portable configuration и pixels. Heun TXT выполняет
пять evaluations; Euler IMG/OUT strength0.5 — два.

Installed token-weight omission сохранила correct frozen inputs и дала один
finite provisional completed candidate, затем same-input pixel RED до Add:
0 accepted mutant layers/0 saved mutant cycles. Raw native cleanup превысил
свой deadline. Protected restoration независимо проверила physical idle
и восстановила все43 original worker sources; поздний bounded proof отдельно
подтвердил exit с сохранением исходных cleanup errors. Fresh Euler TXT/IMG/OUT3 полных
cycles воспроизводят healthy same-choice pixels. Всего подтверждены11 saved/
reopened accepted packages и13 new admissions; candidate mutation не добавляется
к accepted count. Catalog9 resources/14 versions сохраняет prior6/10/defaults:
четыре managed files приняты в отдельном initial0-job UI setup, добавлены только
три owners и Anima version существующего Cyberfalafel CivitAI resource.

На этом историческом checkpoint dynamic multi-job/seed/crash Reuse оставались
открытыми; следующий bounded Anima checkpoint записан выше. Non-Euler IMG/OUT, ER-SDE order3, arbitrary formats,
качество/Invoke author recipe/public delivery/release и полный MVP этим bounded
срезом не квалифицированы; статус «Пока не обещать» сохранён. Предыдущие checkpoint
counts и historical limits ниже не расширяются.

Отдельный [installed multiple-LoRA UI checkpoint](./engineering/phase-2c-noobai-lora-stack-ui-research.md)
подтвердил 8 normal EPS/V TXT cycles в 8 admissions: AB, BA, B-enabled-zero и
B-disabled на objective, 256×256/три steps/seed0, native external VAE/FP32.
Exact Digital Art−0.5/Lineless+0.75 выбираются через настоящий UI; remove/re-add
задаёт порядок без отдельного reorder control. Полный configured stack и ordered
enabled subset остаются frozen после live reorder/weight edits. Explicit Add и
Save/readback/reopen сохраняют exact portable identities, порядок, enabled/weight
и текущий draft. UI comparison проверяет ordered name/version/SHA/enabled/weight;
CivitAI IDs независимо проверены в portable provenance, без утверждения о проверке
каждого rendered description field. B-zero и B-disabled дают одинаковые pixels;
AB и BA отличаются от этих controls, без требования pixel relation между AB/BA.
Strict catalog6/10 сохраняет исходные девять versions: единственная adoption
171,540,060-byte Lineless выполнена в отдельном setup; normal и fresh runs добавили
0 managed files. Installed weight-swap дал causal same-input pixel RED на первом
finite AB candidate до Add: 1 provisional completion, 0 accepted layers и
0 полных saved cycles. После physical exit восстановлены43 original inode/mode/
mtime/bytes, backup отсутствует; fresh restored EPS4 GREEN воспроизводит все четыре
healthy same-choice pixels, physical native exit подтверждён. Independent SQLite/
raw ZIP/Pillow aggregate проверил 12 qualified saved cycles/packages (8 normal+
4 fresh), точные receipts/pixels/ordered tuples; 14 total admissions включают ещё
1 provisional mutant и1 excluded saved setup partial. Все prior model/queue rows
сохранены, final Main/worker idle и43 exact sources подтверждены. Предыдущие native
algebra counts остаются отдельными. Этот historical gate предшествует bounded
Anima worker0.14 и bounded dynamic/seed checkpoints выше. Cap32/bounded truncation был открыт на этом срезе; завершённый bounded follow-up приведён выше.
Arbitrary formats/quality/Invoke parity/public delivery/release и статус
«Пока не обещать» не закрыты.

Предыдущий [native multiple-LoRA checkpoint](./engineering/phase-2c-noobai-lora-stack-native-research.md)
подтвердил12 normal EPS/V loader variants/11832 all-target observations на
half-loaded trained checkpoints: exact Digital Art−0.5 и Lineless+0.75, полный
986 targets каждого source и union986 (UNet722/CLIP1 72/CLIP2 192). Independent
source/graph mapping и temporary FP32 CPU module algebra проверяют single/AB/BA/
enabled-zero controls, source→adapter→signed weight binding и unload restoration.
Оба normal PID exits и43 original sources подтверждены. Это0 UI jobs/images/
receipts/conditioning/denoising; catalog5/9 и153 queue rows не пополняются,
source use остаётся local precondition без adoption/download/runtime copies.
Installed weight-swap mutant прошёл2 healthy single variants/1972 observations,
затем дал точный AB numeric RED. После physical child exit восстановлены43
original inode/mode/mtime/bytes, backup отсутствует; fresh EPS6 GREEN/5916
observations воспроизводит normal base SHA. Final proof подтверждает unchanged
полные catalog/queue rows5/9/153 и managed files, Main/worker idle и current
oracle SHA во всех четырёх executions. Additive A/B и B/A совпадают в пределах
FP32 tolerance; immutable stack order по-прежнему recorded setting. Этот native
checkpoint не проверял multiple-LoRA UI→queue→Add/Save/readback/reopen/comparison;
отдельный completed UI follow-up описан выше; historical native counts не расширяются.
Исторические counts и «Пока не обещать» сохранены. На этом native checkpoint
Anima0.14/dynamic/arbitrary formats/quality/Invoke parity/public delivery/release
оставались открытыми; последующий bounded Anima срез описан выше.

Предыдущий installed [embedding polarity срез](./engineering/phase-2c-noobai-embedding-polarity-research.md)
(08.10.2026) прошёл четыре finite normal EPS/V TXT UI cycles через explicit
Add/Save/readback/reopen/comparison: exact crossed trained/zero refs, один literal
на sign,256×256/три steps/seed0, LoRA−0.5 и native external VAE/FP32.
Completion остаётся temporary до Add. Три успешных native oracles проверили12
direct hidden/pooled/handoff assignments до denoising, без новых jobs/receipts.
Installed EPS sign-swap завершил два finite UI cycles до causal directional RED,
сохранив unequal pixels; restored43/original inode/mode/mtime/bytes/backup absence
и physical exit подтверждены, fresh EPS pair2 GREEN. Final evidence связывает
все8 saved packages/Pillow pixels с SQLite completed rows/receipt bytes, exact
signed refs/settings и frozen0/current draft37. Mutant pixels равны противоположным
normal choices, fresh — своим; catalog5/9 сохранён, новых managed files нет.
Multiple-LoRA order, Anima0.14, dynamic, arbitrary formats/quality/Invoke parity,
public delivery/release и полный MVP открыты. Прежние counts, negative scope и
статус «Пока не обещать» сохранены.

Текущий installed component срез (08.10.2026):
[Installed NoobAI components](./engineering/phase-2c-noobai-component-inference-research.md)
завершил 36 normal admissions/completions и два отдельных lifecycle с четырьмя
admissions, двумя Cancel, шестью preserving missing-component refusals и двумя
completed restored Retry. Completion остаётся temporary до explicit Add;
package меняется через Save. Refusal не добавляет queue/candidate/receipt/seed
effects и сохраняет durable owners после реальных current draft37 edits;
restored Retry выполняет frozen seed0. `MODEL_FILE_MISSING/CORRUPT` используют
фиксированное neutral resource сообщение; шесть causal public-controller RED
на actual missing/same-size-corrupt managed files отделены от installed
missing-only lifecycle. Installed EPS-txt2img semantic mutations и fresh
restored normal run проверены отдельно: четыре mutations (ignored VAE,
validated LoRA omitted before application, positive-only и negative-only
embedding masking) дали causal pixel RED после шести finite
Generate/Add/Save/readback/reopen cases каждая. Исходник восстановлен между
прогонами; fresh restored EPS-txt2img normal прошёл шесть finite cycles с native
physical exit. Все 43 worker source files byte-exact восстановлены, Main/worker idle.
Bounded polarity follow-up описан выше; multiple-adapter order, Anima worker0.14,
dynamic batches и release остаются открытыми. Статус «Пока не обещать» сохранён.

Последующий [bounded VAE encoder checkpoint](./engineering/phase-2c-noobai-vae-encoder-research.md)
завершил 8 finite EPS/V TXT/strength0.5 IMG cases через реальный Generate и
explicit Add/Save/readback/reopen/comparison. Completion остаётся temporary;
current draft37 не заменяет frozen0 или exact VAE в accepted record. Installed
EPS-img2img encode-zero mutant дал intended pixel RED после двух full finite
cycles, а не setup/non-finite refusal. Source restored43 с physical exit и
original inode/mode/mtime подтверждён; fresh restored pair прошла два finite GREEN cycles с physical exit.
Outpaint encoder не проверялся этим TXT/IMG срезом. All-layer/formats/quality/Invoke parity,
arbitrary multiple-LoRA combinations/order, Anima worker0.14, dynamic и release остаются открытыми.
Статус «Пока не обещать» сохранён.

Отдельный [outpaint encoder checkpoint](./engineering/phase-2c-noobai-outpaint-encoder-research.md)
прошёл четыре finite EPS/V normal OUT Generate cycles в четырёх admissions,
без Cancel/refusals, при256×256/трёх requested steps/FP32/seed0/strength0.5
и двух effective native denoising evaluations. Completion остаётся temporary до
explicit Add; Save/readback/reopen/comparison сохраняют exact frozen refs и pixels
при current draft37. Две matched пары имеют одинаковую contribution alpha,
сохраняют protected source и меняют visible generated/saved merged RGB на
соответствующих координатах. Catalog5/9 сохранён без новых managed files;
physical exit обоих native runs подтверждён. Installed EPS-OUT encode-zero mutant
дал intended visible-RGB RED после двух finite cycles; physical exit/restored43/
original inode/mode/mtime подтверждены. Fresh restored pair прошла два finite
GREEN cycles с physical exit и exact original EPS RGBA/merged pixels. Final8 OUT
cycles (4 normal +2 finite mutation cycles до causal RED +2 fresh GREEN) связаны
с actual SQLite completed rows/receipt bytes и CPU control descriptors всех
frozen VAE refs; independent Pillow saved `.igs` decode проверяет alpha/protected
source/corresponding visible/merged pixels. Main/worker/nativeData idle; restored43
с original inode/mode/mtime/bytes и отсутствие backup подтверждены. Прежние
8 normal +2 mutation +2 fresh TXT/IMG counts не меняются.
Bounded polarity follow-up описан выше; arbitrary multiple-LoRA combinations/order, Anima worker0.14, dynamic, all-layer/formats,
quality/Invoke parity, public delivery и release открыты. Статус «Пока не обещать» сохранён.

Предшествующий component source/Prepare срез (08.10.2026):
[NoobAI component research](./engineering/phase-2c-noobai-components-research.md).
Три component incompatibility codes имеют фиксированные безопасные Generate/Retry сообщения без arbitrary resolver paths. Controlled healthy/refused/restored tests подтверждают отсутствие новых rows/candidates/receipts/seed effects при refusal и сохранность existing owners; completion остаётся temporary. Четыре isolated source/controller semantic mutations краснят нужные assertions и восстановлены; это отдельное evidence от последующих четырёх installed EPS-txt2img numerical REDs, описанных выше. Trained combinations оставались открытыми на этом source/Prepare checkpoint и проверены bounded срезом выше. Anima/new-worker regression, dynamic batches и release остаются открытыми. Статус «Пока не обещать» сохранён.

Предшествующий installed NoobAI outpaint checkpoint (07.10.2026):
[Mixed-alpha outpaint qualification](./engineering/phase-2c-noobai-outpaint-research.md)
завершён GREEN: четыре finite completions — два txt2img source preconditions и два
completed frozen outpaint Retry; шесть admissions включают два отменённых originals.
Шесть preserving policy refusals не добавляют durable effects; восстановление
профиля разрешает прежний Retry с frozen source/seed0/strength0.5 несмотря на
current draft edits. Completion остаётся temporary до Add; saved `.igs` меняется
через Save. Component combinations оставались открытыми на этом checkpoint;
последующий bounded срез описан выше. Independent component gates, new-worker Anima regression, dynamic batches,
authored masks/Regional Guidance/Smart Patch и release остаются открытыми.
Статус «Пока не обещать» сохранён.

Предшествующий installed NoobAI author checkpoint (07.10.2026): [Installed NoobAI author-recipe qualification](./engineering/phase-2c-noobai-author-recipe-research.md)
подтверждает temporary completion до явного Add, actual Cancel без нового
candidate/receipt/actual seed и три preserving frozen Retry refusals. Успешный
отдельный lifecycle report имеет четыре finite completions/пять admissions/одну
отмену/три отказа; два author-parameter completions сохранены отдельно. Пять
matched trained controls завершили свои assertions в partial report, который
затем упал на oracle-launcher setup; он не объявлен full bounded GREEN. Installed
CPU numerical mutations и restored startup/exit описаны отдельно от trained GPU
controls. Dynamic batches, NoobAI outpaint/component matrix и release остаются
открытыми; статус «Пока не обещать» сохранён.

Предшествующий noise-profile срез (07.10.2026):
[exact-file ZTSNR/spacing](./engineering/phase-2c-noise-profile-research.md)
реализованы в Model Manager, Main SQLite policy, frozen execution/Retry и
portable accepted configuration/read-only comparison. Defaults false/leading
отмечены как assumptions; old accepted absence остаётся Unavailable. Worker0.14
применяет native beta/timestep semantics; DPM++ SDE + ZTSNR отказывает явно.
На этом CPU/controlled transport/storage checkpoint trained NoobAI author
recipe и release ещё не были квалифицированы. Статус «Пока не обещать» сохранён; исторические checkpoints
ниже описывают границы своего времени.

Текущий v-prediction срез (07.10.2026): [Installed Illustrious v-prediction qualification](./engineering/phase-2c-installed-v-prediction-research.md)
подтверждает четыре finite completions в пяти admissions, один retained canceled
original и один public Retry refusal после смены library type на `epsilon`.
Отказ не создаёт row/candidate/receipt, не продвигает actual seed и сохраняет
Project/source/staging/сохранённый `.igs`. После настоящего UI восстановления
`v_prediction` успешный Retry использует исходные frozen inputs/target; completion
остаётся временным до явного Add. Save/readback/reopen сохраняют accepted
prediction и исходные imported pixels; comparison отличает его от текущего
opposite library type. Отдельный production IPC replay подтвердил исправленное
объяснение `GENERATION_INPUT_CHANGED` для checkpoint или prediction type,
сохранение queue/results/Project/package и physical exit без новой inference
completion. Bounded installed evidence использует 256×256/три шага/seed `0`/
Euler a/Embedded FP32/LoRA −0.5 и img2img strength 0.5. Dynamic multi-job batches,
actual seed cursor/crash-reopen `Reuse`, полный author recipe, quality и release
остаются открытыми; PP-008 сохраняет «Пока не обещать».

Текущий embedding срез (07.10.2026): [Installed Illustrious embedding qualification](./engineering/phase-2c-installed-embeddings-research.md)
подтверждает восемь finite completions в девяти real admissions. Один original
остаётся canceled без completion receipt/candidate/seed advance; после настоящей
смены library Default на artificial zero control и удаления обоих current
literal refs public Retry сохраняет original trained IllustriousPhoto
prompts/refs/target/seed `0`/Embedded FP32. Completion остаётся временным до
явного Add. Save/readback/reopen/comparison сохраняют accepted portable identity,
исходные imported pixels и отличие от live empty refs. Positive/negative
txt2img causal pairs и weighted/repeated common-source img2img при strength 0.5
меняют pixels только при смене trained/control weights. Это installed worker
0.12.0 development evidence при 256×256/трёх requested steps/LoRA −0.5; prior
catalog/source bytes сохранены. Live CivitAI install, dynamic batches,
Anima/presets, arbitrary formats/quality и signed release остаются отдельными
gaps; публичный статус PP-008 не повышен.

Текущий внешний VAE срез (07.10.2026): [Installed external VAE qualification](./engineering/phase-2c-installed-external-vae-research.md)
подтверждает восемь finite completions и девять настоящих admissions: один
original остаётся canceled без receipt/candidate/seed advance. После смены
Default и Reset public Retry сохраняет original native VAE/target/prompt/seed/
FP32, не следует текущему Embedded. Completion требует прежнего явного Add;
исходные imported layers и recorded portable metadata сохраняются через Save/
reopen/comparison. Это bounded installed development evidence при 256×256,
трёх requested steps, img2img strength 0, без CivitAI/release/whole-MVP claims.

Текущий precision срез (07.10.2026): [Installed VAE precision qualification](./engineering/phase-2c-installed-vae-precision-research.md)
подтверждает 6 finite completions и 0 точных non-finite refusals в
шести installed Illustrious policy/mode случаях. Refusal имеет Main-owned
`GENERATION_VAE_NON_FINITE` и понятное объяснение, не публикует PNG/candidate,
не меняет source layers, receipts, actual seed или сохранённый `.igs`.
Actual Cancel сохраняет canceled original; Retry использует frozen FP32
после правки текущего draft на FP16. Completion требует прежнего явного
Add/Save. Это bounded development evidence при 256×256/трёх шагах,
не внешний VAE, release lifecycle или весь MVP; статус «Пока не обещать».
GPU отказ в этом fixture не наблюдался; путь ошибки отдельно проверен controlled JSONL → actual Main/SQLite.

Текущий outpaint срез (07.10.2026): [public Generate/frozen Retry](./engineering/phase-2c-public-outpaint-research.md)
подключены для обеих семей при qualified worker 0.12.0 и exact local LaMa.
Installed development Electron завершил шесть trained cases при 256×256/трёх
шагах: у каждой семьи normal source, mixed-alpha Generate и frozen Retry после
actual Cancel. Explicit Add/Save/reopen и outpaint comparison сохраняют source
layers, exact contribution alpha и portable provenance без local paths.
Статус обещания остаётся «Пока не обещать»; setup/release и прочие MVP gaps
перечислены в research note. Последующие описания прежних checkpoints
сохраняют исторические границы evidence, а не отменяют этот более новый срез.

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
Полный контракт ещё не выполнен: Smart Patch variants и полный pipeline не подключены; runtime installer отсутствует; busy Generate подключён отдельным checkpoint ниже.
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
[Queue result previews/navigation](./engineering/phase-2b-queue-result-preview-research.md)
теперь соединяют завершённый job/session с проверенным candidate и одноразовым
Canvas focus/show/fit. Missing cache не блокирует full-PNG preview; старый
document допускает просмотр с прежним запретом Add. Ручной Refresh повторяет
Results/cache read; viewing не меняет queue, document/bbox, seed, Undo или `.igs`.
Flat sessions и reviewed cross-session acceptance сохранены. Session filtering,
автоматическое продолжение после Open/recovery и accepted history ещё открыты.
[Frozen Retry during inference](./engineering/phase-2b-busy-retry-research.md)
допускает новый reviewed attempt без ожидания конца текущего job. Live ready
копируется только для проверки сохранённого request; источник, capacity и
document/close gate остаются прежними. Serial drain подхватывает publication
даже после idle observation, а следующий worker снова квалифицируется.
Retry не меняет existing candidates/seed/Project/`.igs`.
[New Generate during inference](./engineering/phase-2b-busy-generate-research.md)
готовит новый frozen target через один CPU child того же установленного runtime,
пока текущий GPU продолжает работу. Generate другого Project добавляет pending
batch; same-Project Generate сохраняет точное подтверждение replacement и
повторяет его при late completion. Подтверждённый выход CPU/GPU предшествует
следующему inference, unconfirmed exit удерживает owner и блокирует claims.
Dirty/Undo/accepted layers/actual seed/`.igs` сохраняются; подготовка прерывается
при закрытии приложения, per-Project close сохраняет operation gate. Native
evidence использует controlled peers, а полный GPU/release
pipeline остаётся открытым, статус PP-008 не повышается.
[Seed Reuse checkpoint](./engineering/phase-2b-seed-reuse-research.md) теперь
подключает document-scoped completed cursor к внутреннему Prepare/enqueue,
отображает его в Project и переносит snapshot в `.igs` только при Save;
renderer Generate использует этот cursor и bounded planning, включая admission во время GPU busy; полный production flow scheduling остаётся открытым.

[Opaque img2img checkpoint](./engineering/phase-2c-img2img-research.md) расширяет
тот же durable контур очереди и staging на fully opaque Illustrious input.
Source pixels и denoising strength фиксируются до enqueue, Retry их копирует;
непринятый output остаётся временным, только явный Add создаёт Raster с provenance.
Migration сохраняет исторические txt2img attempts, receipts и seed cursor;
advisory CPU-чтение canvas не создаёт jobs и входит в app-close barrier.
Частичная прозрачность отклоняется до принятого результата, существующие правила
Cancel, recovery, явного Save и Undo сохраняются. Это не закрывает весь PP-008.

[Исправления аудита](./engineering/product-audit-fixes.md) подтверждают Add
результата с допустимым actual seed, отличным от planned seed, и его portable
Save. Подмена seed в staging manifest без durable receipt отклоняется без
изменения документа и удаления PNG.

[Result sessions](./engineering/phase-2b-result-sessions-research.md) добавляют
transient preview filter без изменения global checkbox/Add scope. Hidden selected
count и полный confirmation сохраняют видимость последствий Add. Closed Queue
Open продолжает exact result focus после ordinary Open или явного Recover;
Cancel/context/close/failure отзывают одноразовое намерение. Explicit Discard
Recovery отменяет его, фиксирует tombstones всех временных результатов этого
Project, затем удаляет shadow и открывает saved `.igs`. Ошибка до фиксации
tombstones сохраняет shadow; отложенная очистка файлов показана warning.
Saved файл и его accepted assets, operational queue history, actual seed и
другие Projects сохраняются. Несохранённые правки, включая принятые слои только
в shadow, удаляются. [SQLite lock safety](./engineering/sqlite-lock-safety-research.md)
убирает raw descriptor checks: pending sibling jobs остаются видимыми после
закрытия и повторного открытия соседнего соединения; altered SQLite file
permissions требуют явного repair. Fresh read
проверяет actual document и exact job/session, без подстановки соседнего кандидата.
Filter/navigation не меняют `.igs`, dirty/Undo, bbox, actual seed, queue/staging,
accepted layers или provenance. Native proof использует реальные Electron/IPC/
SQLite/files и controlled generation fixtures; полный GPU/release flow на этом историческом checkpoint оставался открытым;
публичный статус не повышается.
[Staging-only recovery](./engineering/phase-2b-staging-only-recovery-research.md)
добавляет Home/Open/Import decision для closed ready Project с verified completed
Results без dirty shadow. Recover открывает saved документ clean; Cancel не
открывает вкладку; Discard сохраняет прежний all-session scope. Недоступный
staging при absent/clean shadow показывается как unavailable с диагностикой,
сохраняя saved Open/Import/Save/rebuild и неизвестные файлы; pending document
shadow сохраняет свой статус и decision first. Fresh inspections и общий Project gate
сохраняют границы dirty recovery, acceptance и seed; это не full GPU/release proof.

[Project-local accepted history](./engineering/phase-2b-project-accepted-results-research.md)
теперь реконструирует список current accepted Raster results из owned provenance
после Add, Undo/Redo, shadow Recover и portable Save/reopen. Temporary candidates
и imported raster без provenance исключены; Queue prune и Clear Undo history не
удаляют accepted entries. Выбор записи меняет только transient layer selection/
Layers scroll. [Saved-result SQLite index](./engineering/phase-2b-saved-accepted-index-research.md)
теперь заменяет Home и accepted-result metadata одной транзакцией из verified
saved `.igs`; unsaved Add/Undo/shadow Recover и Queue prune не публикуют изменения
в нём. Отказ индекса после committed Save сохраняет `.igs`, прежний целый DB
snapshot и warning; workspace Refresh восстанавливает projection из saved source.
Internal query исключает unhealthy/trashed/foreign-lineage записи. Cross-project
history browser/navigation и public IPC пока отсутствуют, публичный статус не повышается.

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

[Illustrious LoRA checkpoint](./engineering/phase-2c-lora-research.md) сохраняет
точные ресурсы и веса при поздней правке Project/Default, Cancel и Retry.
Worker получает только verified enabled subset; результат остаётся в staging
до явного Add, а полный frozen stack попадает в `.igs` только после Save.
Disabled missing refs не блокируют generation; incompatible/corrupt/unsupported
active files и старый worker отклоняются явно. Срез не завершает PP-008.

[VAE precision checkpoint](./engineering/phase-2c-vae-precision-research.md)
сохраняет выбранную policy при поздней правке Project и Cancel/Retry; старый
worker отказывает manual precision, но сохраняет нейтральный Auto путь.
Finite-output refusal не публикует успешный candidate и не меняет `.igs`.
Контролируемый Electron сценарий проверяет явный Add/Save/reopen отдельно
от actual CPU/NVIDIA ML; PP-008 не объявляется завершённым.

[External VAE inference](./engineering/phase-2c-external-vae-inference-research.md)
сохраняет exact resource/size/hash при поздней правке Project, смене Default,
Cancel и Retry. Выбранный компонент управляет txt2img decode и opaque img2img
encode/decode с прежними precision/finite guards. Успех worker не добавляет слой
без явного Add; unsupported, changed и non-finite input не публикуют candidate.
Проверки Electron с controlled peer и actual ML имеют отдельные evidence;
PP-008 остаётся неполным.

[Embedding authoring checkpoint (04.10.2026)](./engineering/phase-2c-embedding-authoring-research.md)
на этом историческом срезе не добавлял ML-возможность: saved embedding refs и known unbound installed
tokens отказывали до composition/enqueue с объяснением, без silent plain-text
fallback или автоматической привязки во время Generate. Этот срез не менял
accepted-result provenance, staging или границу явного Add; qualified embedding
weights оставались открытыми до последующего inference checkpoint. Bounded
installed trained evidence добавлен выше; полный pipeline остаётся открытым,
PP-008 не завершён.

[Public Anima Generate and Add](./engineering/phase-2c-anima-public-generation-research.md) используют original click capture,
app-wide runtime lease, whole-batch publication и exact replacement review.
Document/index/close races отказывают или отменяют только новый batch, сохраняя
прежние результаты. Worker success остаётся временным candidate до Add; mixed
Illustrious/Anima selection предварительно проверяется целиком. Настоящие
owners проверены с явно controlled qualification/inference peers; UI/IPC и
saved comparison проверены native Electron отдельно от CUDA/trained weights.
Regions/outpaint, Smart Patch, presets и release pipeline остаются открытыми;
публичный статус PP-008 не повышается.

[Empty-queue dispatch correction](./engineering/phase-2c-installed-runtime-qualification-research.md)
проверяет pending metadata до GPU reservation: пустая очередь, fenced-only jobs
или существующий running row не создают idle qualification/inference child.
Preflight не читает frozen файлы, не занимает слот и не меняет SQLite; actual
verification и cross-instance claim CAS остаются окончательным решением.
Реальные queue/controller/runtime tests и semantic mutations сохраняют late
fences, enqueue barrier, successful Retry wake после idle и shutdown.
Финальный installed development runtime прогон отдельно завершил четыре
trained UI сценария Illustrious/Anima × txt2img/opaque img2img при 1024×1024 и
трёх шагах: public Generate не изменяет document до явного Add, приёмка сохраняет
прежние слои, а accepted bytes/settings проходят rendered Save/reopen. Opaque
img2img использует exact frozen target, Reuse сохраняет actual seed `0`.
Это не автоматический Add/Save или доказательство всех options, Smart Patch,
regions/outpaint, качества моделей и release lifecycle. PP-008 остаётся
неполным и «Пока не обещать».

[Installed CFG Generate/Add](./engineering/phase-2c-installed-cfg-rescale-research.md)
проверяет three matched txt2img cases и nonzero opaque img2img: completion
публикует temporary candidate и не меняет layers/сохранённый `.igs` до явного
Add/Save. После durable admission правка draft на 0.2 не меняет frozen queue
или accepted effective zero/0.7. Case/job/receipt identities и target pixels
сверяются с реальными output bytes. Numerical txt2img effect и healthy
Save/reopen не объявляют готовыми outpaint, masks, Smart Patch, остальные
options или release lifecycle.

[Normal outpaint conditioning foundation](./engineering/phase-2c-outpaint-conditioning-research.md)
adds internal Main-owned exact target/soft-alpha/policy/LaMa snapshots and worker
CPU coherence/fade/local infill/contribution helpers. External Invoke method
comparison and trained local CPU LaMa evidence do not constitute family masked
inference, durable candidate publication, accepted RGBA provenance or recovery.
Mixed-alpha Generate still refuses both families; PP-005/007/008 status remains
«Пока не обещать». First-engine auxiliary delivery and release lifecycle remain
open under the existing accepted installation decision.

[Internal Illustrious masked denoising](./engineering/phase-2c-illustrious-outpaint-research.md)
now checks the native denoising loop with protected source/noise before both
UNet and scheduler, strict progressive thresholds and final protected VAE input.
57 native CPU tests cover five methods, both prediction types and strength;
11 trained CUDA cases cross Main snapshot/local LaMa/masked loop/contribution
with replay, black/unmasked, white/zero and changed-seed controls. These are
development internal numerical checks, not installed public outpaint jobs,
durable RGBA acceptance/provenance or Save/reopen. Coupled durable integration
and auxiliary installation remain open.
PP-005/007/008 matrix and public readiness remain «Пока не обещать».

[Internal Anima masked denoising](./engineering/phase-2c-anima-outpaint-research.md)
adds source/noise restoration after completed user steps through all six existing
flow methods, with inverse-shift linear thresholds and shifted noise mixing.
Heun predictors retain their native intermediate state. Weighted both-sign
conditioning, LoRA and seed streams use the shared ordinary executor. Native
external-source oracle tests and trained BF16 controls verify this internal path;
public mixed-alpha admission, durable RGBA/provenance, auxiliary installation and
installed Generate/Add/Save/reopen remain open. These results do not raise the
public readiness of PP-005/007/008 or complete phase2C.

[Internal frozen outpaint jobs](./engineering/phase-2c-outpaint-jobs-research.md)
now retain exact mixed-alpha PNG/derived keep mask, fixed policy/resource identities
and family settings in two distinct durable operations. Whole-batch admission,
restart and internal Retry use the existing real SQLite/owned input store.
A Main resolver verifies the pinned local LaMa under shared application storage.
Public mixed-alpha Generate, worker dispatch, staging RGBA publication and accepted
portable outpaint provenance remain explicitly closed. This checkpoint does not
qualify installation or Generate/Add/Save/reopen and leaves PP-005/007/008 public
readiness and phase2C completion unchanged.

[Internal outpaint execution (06.10.2026)](./engineering/phase-2c-outpaint-execution-research.md)
теперь подключает два frozen operations к explicit strict worker 0.12.0 commands
и native masked executors обеих семей. Worker сохраняет RGBA contribution;
Main независимо сверяет expected contribution alpha с owned source и exact
policy перед temporary publication. Completion не меняет Project или `.igs`.
Selected Add preflight проверяет contributions/provenance до journal, sibling
cancellation и discard; portable Add/Save/read/comparison сохраняют actual seed,
включая valid uint32 deviation. Public mixed-alpha Generate и public outpaint
Retry остаются закрытыми; first-setup LaMa installer и installed trained/release
qualification — следующие границы. Executed evidence и counts находятся в
research note. PP-005/007/008 остаются «Пока не обещать», phase2C не завершена.

[Main-owned LaMa delivery](./engineering/phase-2c-lama-install-research.md) добавляет pinned Main downloader,
внутреннюю exact filesystem installation/reuse и план полного объёма по trusted
runtime artifacts плюс LaMa. Auxiliary preview явно weights-only и не заменяет
полный engine preview. Set up/Install/Repair, public mixed-alpha Generate/Retry
и installed/release qualification остаются открытыми; PP-008 не повышается.

[Public outpaint admission (07.10.2026)](./engineering/phase-2c-public-outpaint-research.md)
подключает mixed-alpha Generate и failed/canceled frozen Retry для Illustrious и
Anima при явно qualified worker 0.12.0 и exact local LaMa. Изменение current
document/close/shutdown до final SQL commit запрещает publication; revocation
при последующем child-exit wait отменяет только новые owned jobs с status proof.
Missing/corrupt/unsafe helper не блокирует ordinary queue/history recovery.
Completion остаётся временным; Add/Save/reopen сохраняют два portable outpaint
kinds и original frozen baseline. Built Electron и installed worker завершили
шесть trained UI completions при 256×256/трёх шагах и signed LoRA −0.5:
у каждой семьи normal source, mixed-alpha Generate и frozen Retry после actual
Cancel. Два canceled originals сохранены; Retry не подменяет original source,
policy/LaMa и strength новым draft. Genuine CPU LaMa и CUDA worker сохраняют
source layers/exact contribution alpha через Add/Save/reopen/comparison; portable
records не включают local paths или source/weight bytes. Fixed Main installer
с genuine local transport substitute и exact reuse не доказывает public network
download или setup. Executed evidence и qualification limits находятся в research
note. First-setup installation, signed release, remaining
options, authored masks/regions/Smart Patch и preset work остаются открытыми;
PP-005/007/008 сохраняют «Пока не обещать».

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

[Embedding inference](./engineering/phase-2c-embedding-inference-research.md)
заменяет blanket refs refusal на qualified dual-CLIP loading. Каждый concrete
branch получает свой exact набор; known token без привязки отклоняет batch до
publication. Corrupt/unsupported/over-budget input не создаёт successful candidate;
Retry проверяет frozen active files, success сохраняет прежнюю explicit Add/Save
границу. Authoring checkpoint выше описывает прежний отказ, не текущее ограничение.
Controlled Electron и actual synthetic ML evidence разделены; PP-008 не завершён.

[Anima durable jobs](./engineering/phase-2c-anima-durable-jobs-research.md)
использует общий operational staging для внутренних Anima attempts: receipt-owned
completion, PNG/color verification, Cancel, frozen Retry и restart recovery.
На этом историческом checkpoint Add ещё отказывал до побочных эффектов.
[Следующая интеграция](./engineering/phase-2c-anima-public-generation-research.md)
подключает public Generate и portable mixed-family Add через прежние owners;
полный release pipeline остаётся открытым.
