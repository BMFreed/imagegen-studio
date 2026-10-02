# Общие UI-компоненты

Это публичный контракт повторяемых элементов Electron renderer и `docs/prototype-app`. Перед правкой
откройте сам компонент и его потребителей: сигнатура в коде остаётся источником
точных типов. Компоненты решают задачи представления; состояние Project и команды
остаются у владельца сущности. Браузерные проверки ниже доказывают поведение
Vue-прототипа, а не готовность production UI.
Общий редактор размера используется в обоих контурах; его production-проводка
проверяется отдельно через Electron.

| Роль                      | Компонент                                                                                                                                                        | Текущий потребитель                                                                        |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Действие с иконкой        | [`IconButton.vue`](../prototype-app/src/components/IconButton.vue)                                                                                               | [`AppChrome.vue`](../prototype-app/src/components/AppChrome.vue)                           |
| Поверхность слоя          | [`ProjectEntitySurface.vue`](../prototype-app/src/prototypes/project/ProjectEntitySurface.vue)                                                                   | Raster, Smart Patch и Regional rows                                                        |
| Выбор ресурса             | [`GenerationResourceSelect.vue`](../prototype-app/src/components/generation/GenerationResourceSelect.vue)                                                        | Project Settings, LoRA stack, Preset editor                                                |
| Поле с подписью           | [`LabeledControl.vue`](../prototype-app/src/components/LabeledControl.vue)                                                                                       | [`ProjectLayersPanel.vue`](../prototype-app/src/prototypes/project/ProjectLayersPanel.vue) |
| Размер и пропорции        | [`ResolutionControl.vue`](../../src/renderer/components/ResolutionControl.vue)                                                                                   | Electron New Project/Project bbox; prototype New Project/Project Size                      |
| Действия и справка prompt | [`PromptEditorActions.vue`](../../src/renderer/components/PromptEditorActions.vue), [`PromptEditorHelp.vue`](../../src/renderer/components/PromptEditorHelp.vue) | Electron PlainPromptEditor; prototype ProjectPromptCard                                    |

## Публичный API и инварианты

- **Размер и пропорции:** `v-model: ResolutionSize` (`width`/`height`: `number | null`)
  и `v-model:aspectRatio: AspectRatioState`; обязательный `max`, опциональные
  `min` (1), `step` (8), `disabled`, `widthLabel`, `heightLabel`, `swapLabel`.
  В обычном layout, используемом New Project, поля стоят слева, SVG preview —
  справа; `layout="expanded-preview"` в узкой панели Project центрирует preview
  над полями. В обоих вариантах внешняя рамка preview имеет один фиксированный
  размер 200 × 132 CSS px: меняется только показанное внутри соотношение сторон.
  Lock стоит рядом с Aspect ratio, а swap — между Width и Height. Слот `actions`
  остаётся доступен для контекстных действий владельца. Preset соотношения включает lock,
  изменение стороны с lock сохраняет пропорцию в пределах bounds; swap меняет
  стороны и preset; ручной unlock оставляет текущие размеры. Событие `commit`
  испускается после выбора числового preset соотношения и после swap: владелец
  Project применяет получившийся bbox сразу после обновления модели. Выбор
  `Free` и lock/unlock меняют только режим пропорции и bbox не коммитят. Ручной
  ввод width/height не испускает `commit` и ждёт `Enter` у владельца. SVG preview
  отражает текущие размеры. Очистка input передаёт `null`, а не сохраняет
  скрыто прежнее значение: блокировка Create для New Project и валидация
  числового ввода Project принадлежат владельцу формы.
  Внешнее изменение bbox с другой пропорцией снимает lock, не откатывая bbox.
  Компонент не знает ProjectSession, IPC, undo или preset payload. Production
  владелец New Project применяет размер через Create; владелец production Project
  применяет валидные вручную введённые width/height по `Enter`, без кнопки Apply.
  Позиция bbox не редактируется числовыми полями: при выбранном Bounding Box tool
  и фокусе на canvas стрелки перемещают его на 1 px, Shift+стрелки — на 10 px;
  drag остаётся доступен. Выбор числового preset соотношения и swap применяются
  сразу через `commit`; контекстный Fit имеет собственную команду; prototype
  wrapper сохраняет свою существующую команду. Production Fit — компактная
  иконка в заголовке `Generation area` с доступным именем `Fit to active layer`,
  enabled только при выбранном видимом Raster Layer; текущий prototype Fit to
  visible layers не доказывает это поведение.
  `max` задаёт владелец: предел `.igs` не
  является обещанием доступной GPU resolution. Общие TS-типы и алгоритмы
  находятся в [`resolution-control.ts`](../../src/renderer/components/resolution-control.ts).
- **Действие с иконкой:** обязательные `icon: Component` и `label: string`;
  опциональные `compact`, `disabled`, `loading`, `preserveFocus`, `pressed`, `tooltip` и
  `badge: { dot?, value }`; событие `click`. Кнопка занимает 32 px, в `compact`
  — 24 px; место под иконку и её CSS-размер — 18 px. `label` остаётся доступным
  именем, `tooltip` меняет только подсказку (по умолчанию она равна `label`).
  `disabled` и `loading` не запускают команду. Tooltip вынесен в портал за
  пределы контейнера с `overflow: hidden`.
  `preserveFocus` (по умолчанию false) предотвращает pointer-mousedown focus
  transfer только на нативной кнопке: редактор сохраняет выделение для команды.
  Клавиатурный Tab/Enter остаётся доступным. Не включайте его на открытии
  модальных окон: после закрытия модалки фокус должен вернуться к её trigger.
- **Поверхность слоя:** [`EntityRowController`](../prototype-app/src/prototypes/project/project-entity-row.ts)
  передаёт `state` (`name`, `summary`, `selected`, `visible`, `locked`, необязательный
  `warning`), `menu`, `select`, `toggleVisible`, `toggleLock` и необязательный
  `popoverOpen`. Слоты: `preview`, `header-actions`, `details`, `menu-overlay`.
  Базовый компонент не читает `ProjectSession`. Пассивная часть карточки и
  деталей выбирает слой; кнопка выбора в заголовке остаётся целью клавиатуры и
  drag handle. Пассивная область и кнопка выбора сохраняют обычный курсор;
  hover выделяет карточку целиком, не перекрашивая текст заголовка. Кнопки и поля
  не меняют выделение. **Корень составного редактора,
  включая его отступы, помечайте `data-entity-control`**: иначе клик вне нативного
  input попадёт в выбор слоя. Детали смонтированы независимо от выделения.
  Production [`ProjectEntitySurface`](../../src/renderer/components/ProjectEntitySurface.vue)
  использует тот же DI-подход: необязательный `popoverOpen` и `menu-overlay`
  принадлежат адаптеру, без знания provenance/API в базовом компоненте. Popover
  использует публичные `x`/`y` Naive с placement `left`: горизонтальный якорь
  берётся от кнопки menu, вертикальный — центр viewport для bounded tall body.
  Resize/scroll пересчитывают якорь; internal shift установленного Naive не
  доступен публично и не используется. `menuProps`/`nodeProps` дают
  контекстному меню роли `menu`/`menuitem` и явное `aria-disabled`. Raster-адаптер
  хранит `comparisonLayerId` через `defineModel`; слой без данных сохраняет
  disabled пункт. Закрытие/очистка поздних ответов и возврат фокуса — владелец
  Project. [`GenerationSettingsComparison`](../../src/renderer/components/GenerationSettingsComparison.vue)
  принимает `sections`, `layerName`, `loading`, `error` и испускает `close`; он
  знает только presentation/statuses, имеет scroll body и локальный переключатель
  unchanged rows, без чтения Project или команд Apply/Recall.
- **Выбор ресурса:** `defineModel<string | null>` хранит выбранное значение;
  `valueKey` — `id` (по умолчанию) либо уникальное и стабильное `name`. `resources` содержит
  `id`, `name` и необязательные `version`, `missing`, `previewSrc`, `baseModel`,
  `triggerPhrases`. Есть `ariaLabel`, `disabledIds`, `addedIds`, `disabled`,
  `clearable`, `placeholder`. `disabledIds` блокирует выбор; `addedIds` визуально
  помечает уже добавленные LoRA, не объявляя их текущим значением single-select.
  Выбор не создаёт ресурс. Закрытое значение компактное;
  открытый вариант показывает превью, базовую модель и триггеры, если они есть.
  Поиск учитывает метаданные; `missing` и `disabledIds` блокируют выбор.
- **Поле с подписью:** `label` обязателен, `id` и отображаемое `value`
  опциональны. Default slot получает `{ controlId }`: присвойте его `id`
  настоящего input, в том числе через `NInputNumber.inputProps`. `output` для
  `value` находится вне label. Клик по подписи фокусирует поле, не меняя его
  значение; несколько экземпляров получают разные id.

## Production Advanced Options

`ProjectGenerationAdvancedOptions` — production-адаптер текущего Generation
card: `defineModel<number | null>` хранит optional CFG Rescale; `null` означает
unset, `0` — явное значение. `modelFamily`, `runtimeSupported`,
`runtimeUnavailableReason` и `editingDisabled` управляют доступностью числового
поля. Отдельный Reset остаётся доступен при разрешённом редактировании даже
без runtime capability. Public `NInput` сохраняет сырой invalid text без
clamping; `validity` сообщает именно о неотправленном ошибочном вводе.
Загруженный portable-valid legacy `1` не блокирует Save, но отдельное
operational правило Project блокирует Generate с объяснением. Отображение
unset как `0` не вызывает setter/dirty. [Evidence](./phase-2c-cfg-rescale-research.md).

## Production Denoising Strength

Production `ProjectDenoisingStrength` использует те же `LabeledControl`/`IconButton`
и публичный `NInput`: `defineModel<number | null>`, finite 0–1, пустое поле — unset,
компактный Reset. `target`, `targetError`, `modelFamily`, `supported`,
`runtimeUnavailableReason` и `editingDisabled` принадлежат владельцу; компонент
не делает IPC, композицию или enqueue. Поле постоянно видно в Generation,
disabled state объясняется рядом; Reset исправляет raw invalid/unset даже при
неподдерживаемом текущем target. Без внесённого текста просмотр не меняет draft.
Advisory mode поступает из guarded CPU-composed pixels; layout/bounds слоёв не
доказывают opaque input. [Evidence](./phase-2c-img2img-research.md).

## Как собирать новый экран

1. Найдите существующего потребителя нужного компонента и проверьте его props,
   slots и обработчики. Сначала используйте этот API; изменение общего компонента
   проверяйте на всех его потребителях.
2. Для слоя передайте свой `EntityRowController` через `provideEntityRow`.
   Поверхность отвечает за выбор и hover; владелец сущности отвечает за команды.
   Отмечайте составные редакторы `data-entity-control`.
3. Для поля передайте `controlId` именно нативному input. Не помещайте `output`
   перед input внутрь неявной `<label>`: браузер может связать подпись с output
   вместо поля.
4. Для селектора проверяйте как закрытое имя, так и открытые варианты, disabled,
   клавиатуру, очистку, обновление списка и независимость экземпляров. Адаптер
   ARIA для Naive находится только в компоненте: он наблюдает внутренний класс
   `.n-base-select-option--pending` для `aria-activedescendant`, поэтому смену
   версии Naive проверяйте браузерным тестом.
5. Проверяйте размеры обычного и компактного действия отдельно: hit area,
   статический размер места под иконку и видимый рисунок. Рамка вращающегося SVG
   (`getBoundingClientRect()`) может расти из-за анимации без роста рисунка.
6. Не переопределяйте внутреннюю композицию Naive ради размещения компонента.
   Для центрирования `NEmpty` используйте внешний контейнер: `display: block`
   на его корне разрывает штатную flex-композицию icon/description/extra.
   Для ограниченного по высоте `NCard` используйте `contentScrollable` и
   `footer` slot; `overflow: auto` на корне захватывает геометрию popup follower
   у вложенного `NSelect`. Для `NSplit` используйте публичные `pane1Style` /
   `pane2Style` и bounds, проверяя сжатие всего окна после ручного resize.
7. У основного контекста одно доминирующее заполненное действие. Повторный
   shortcut в empty state — `secondary`, вспомогательный setup/repair —
   нейтральный `secondary`, компактные инструменты — `quaternary` по смыслу.
   Модальный flow имеет собственное primary подтверждение. Это иерархия
   действий, а не запрет нескольких кнопок на экране; отдельный Inspector
   может иметь своё основное действие согласно Home contract. Используйте
   [публичные Button props Naive](https://github.com/tusen-ai/naive-ui/blob/main/src/button/demos/enUS/index.demo-entry.md)
   (`type`, `secondary`, `tertiary`, `quaternary`), а не имитируйте варианты CSS.

Проверки входят через настоящие страницы прототипа:
[`icon-button.spec.ts`](../prototype-app/tests/icon-button.spec.ts),
[`project-layer-rows.spec.ts`](../prototype-app/tests/project-layer-rows.spec.ts),
[`project-polish.spec.ts`](../prototype-app/tests/project-polish.spec.ts),
[`resource-select.spec.ts`](../prototype-app/tests/resource-select.spec.ts) и
[`labeled-control.spec.ts`](../prototype-app/tests/labeled-control.spec.ts).
После правки Vue/TypeScript запускайте `pnpm run typecheck`, после изменения UI —
`pnpm run prototype:test`.
Production layout и общий size-control проходят также через
[`desktop-layout-checks.mjs`](../../scripts/desktop-layout-checks.mjs) в
`pnpm run app:smoke`: настоящий renderer и native window, empty/populated/error
состояния Model Manager, 900×620 / 1440×900 / 1920×1080, Create с последующим
чтением `.igs`. UI-проверка не доказывает живую загрузку CivitAI или inference.

## LoRA-контекст редактора prompt

Общие [правила сопоставления и подсказок](../../src/shared/projects/lora-triggers.ts)
принимают `LoraTriggerSource[]` (id, name, version, phrases). Владелец передаёт
только активные доступные источники. Production-адаптер
[`project-prompt-context.ts`](../../src/renderer/components/project-prompt-context.ts)
берёт `trainedWords` точной сохранённой версии, а не Default ресурса.
`PlainPromptEditor` принимает `loraSources` и `embeddingTokens`; text остаётся
обычным `defineModel<string>`. Редактор не разрешает ресурсы и не создаёт refs.
Прототип сохраняет собственные embedding/selection/history adapters, используя
те же LoRA-правила. [Popup CSS](../../src/renderer/styles/prompt-editor.css)
общий: tooltips портируются в body, поэтому оформление находится вне scoped CSS.
Изменения проверяются Node rules/adapter tests, prototype Project/Preset/Apply
flows и Electron smoke; границы описаны в [review](./project-lora-prompt-research.md).

## Действия и справка редактора prompt

`PromptEditorActions` — компонент представления: обязательный
`attentionTargetAvailable`, опциональные `disabled`, `empty`,
`dynamicPreviewAvailable` (все false по умолчанию); события `browse`, `increase`,
`decrease`, `copy`, `clear`, `dynamicPreview`. Он не читает Project, текст,
clipboard или CodeMirror. Владелец вычисляет непустую цель attention и исполняет
команду. Dynamic preview показывается только при явно подключённом обработчике
и флаге. Все действия используют `IconButton compact` (24/18 px); минимальная
высота карточки должна вмещать всю панель. Browse/attention/clear сохраняют
фокус редактора; открытие modal следует обычному focus lifecycle.

`PromptEditorHelp` принимает `title`, `editorFocused`, `completionSources` и
испускает `focusEditor`. Он владеет лишь состоянием справки. Первый показ через
фокус любого prompt или через Info записывает факт показа в `localStorage`;
автоматический onboarding больше не повторяется в обоих полях. Крестик закрывает
текущую подсказку. Владелец перечисляет
реально подключённые источники: Electron — LoRA triggers, prototype — embeddings
and LoRA triggers. Обычная Info-справка доступна через hover/focus/click и после
закрытия onboarding.

[Общие правила](../../src/shared/projects/prompt-text.ts) работают с обычным
текстом и диапазонами. [CodeMirror adapter](../../src/renderer/components/prompt-editing-codemirror.ts)
применяет attention только к выделению/фразе, уважает read-only и выделяет
локальные undo steps там, где владелец редактора подключает history. Он не
управляет Project history или embedding refs. Prototype сохраняет свою document
history; production Project CodeMirror не подключает local history и передаёт
focus-сессию общему [Project Undo/Redo](../features/project/undo-redo.md).
[Проверки](./project-prompt-actions-research.md): реальные EditorState/history,
Electron pointer/keyboard, clipboard, сохранённый `.igs`, prototype consumers.

## Диагностика синтаксиса prompt

[`PromptDiagnosticsIndicator`](../../src/renderer/components/PromptDiagnosticsIndicator.vue)
принимает `report: PromptSyntaxReport` и `title`. Это локальный status control,
который показывает список по click/keyboard; он не изменяет текст и не управляет
Save/Generate. Общие [правила](../../src/shared/projects/prompt-diagnostics.ts)
возвращают диапазоны, severity, message и явный `truncated` при превышении
100 отображаемых issues. [CodeMirror extension](../../src/renderer/components/prompt-diagnostics-codemirror.ts)
кэширует отчёт на document state, рисует подчёркивания и показывает hover hints.
Статус остаётся доступным в read-only редакторе.

`GenerationPromptEditor.showSyntaxStatus` по умолчанию true; ProjectPromptCard
отключает внутренний индикатор и помещает тот же компонент в существующую
строку metadata. Остальные потребители получают встроенный status без знания
Project. CSS marks/tooltips используют общий `prompt-editor.css` и токены
`--prompt-syntax-error` / `--prompt-syntax-warning`; Naive button severity задаётся
публичным `type`. Нельзя превращать syntax report в resource validation error.
[Проверки и ограничения](./project-prompt-diagnostics-research.md).
