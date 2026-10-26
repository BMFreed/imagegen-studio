# Общие UI-компоненты

`ApplyPresetModal` сохраняет logical `show` при `suspended`: Naive
`displayDirective="show"` удерживает mounted редактор и его raw values, а
отдельное presentation `show` освобождает focus trap. Событие `suspended`
после `afterLeave` разрешает App открыть Model Manager; возврат ждёт его
`afterClose` и settlement guarded catalog read. Диагностики преобразуются в
typed browse intent с `origin: 'preset'` и copied `expectedResource`; библиотечный
Default не выбирается автоматически. Stable action key по section/exact resource
восстанавливает focus после пересоздания diagnostic button. Сигнатуры и executable
границы: `preset-model-handoff.ts`,
[handoff checkpoint](./phase-3-preset-model-handoff-research.md).

Production Preset Manager принимает detached `PresetCreateIntent` от текущего
Project, выбранного Smart Patch draft или принятого результата. Общий session/editor владеет transient
draft, Cancel/guards/Create/retry; source mapper владеет содержимым копии.
`createIntent` не является сохранённым preset ID и не связывает новый preset с
исходником. Source result показывает frozen layer/project label отдельно от
редактируемого имени; отсутствующие reusable settings обозначаются без defaults.
Результат читается через `getRasterPresetData` без текущей Canvas composition.
Точные типы: `preset-create-intent.ts`, `result-preset-draft.ts`; executable
границы — [result checkpoint](./phase-3-result-preset-research.md).
Smart draft использует отдельный `kind: 'smart-patch-draft'`: banner
`Source Smart Patch` показывает captured Project/Patch и authored-settings copy,
а не expanded result prompts. Mapper исключает Size/Seed/geometry до открытия
общего editor; его generic optional sections не получают Patch dimensions.
Граница — [Smart draft checkpoint](./phase-4-smart-patch-current-preset-research.md).

Это публичный контракт повторяемых элементов Electron renderer и `docs/prototype-app`. Перед правкой
откройте сам компонент и его потребителей: сигнатура в коде остаётся источником
точных типов. Компоненты решают задачи представления; состояние Project и команды
остаются у владельца сущности. Браузерные проверки ниже доказывают поведение
Vue-прототипа, а не готовность production UI.
Общий редактор размера используется в обоих контурах; его production-проводка
проверяется отдельно через Electron.

| Роль                       | Компонент                                                                                                                                                        | Текущий потребитель                                                                        |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Действие с иконкой         | [`IconButton.vue`](../prototype-app/src/components/IconButton.vue)                                                                                               | [`AppChrome.vue`](../prototype-app/src/components/AppChrome.vue)                           |
| Поверхность слоя           | [`ProjectEntitySurface.vue`](../prototype-app/src/prototypes/project/ProjectEntitySurface.vue)                                                                   | Raster, Smart Patch и Regional rows                                                        |
| Выбор ресурса              | [`GenerationResourceSelect.vue`](../prototype-app/src/components/generation/GenerationResourceSelect.vue)                                                        | Project Settings, LoRA stack, Preset editor                                                |
| Поле с подписью            | [`LabeledControl.vue`](../prototype-app/src/components/LabeledControl.vue)                                                                                       | [`ProjectLayersPanel.vue`](../prototype-app/src/prototypes/project/ProjectLayersPanel.vue) |
| Размер и пропорции         | [`ResolutionControl.vue`](../../src/renderer/components/ResolutionControl.vue)                                                                                   | Electron New Project/Project bbox; prototype New Project/Project Size                      |
| Действия и справка prompt  | [`PromptEditorActions.vue`](../../src/renderer/components/PromptEditorActions.vue), [`PromptEditorHelp.vue`](../../src/renderer/components/PromptEditorHelp.vue) | Electron PlainPromptEditor; prototype ProjectPromptCard                                    |
| Шумовой профиль checkpoint | [`CheckpointNoiseProfileControls.vue`](../../src/renderer/components/CheckpointNoiseProfileControls.vue)                                                         | Electron/Prototype Model Manager version cards                                             |

## Публичный API и инварианты

- **Шумовой профиль checkpoint:** обязательные `policy: CheckpointNoiseProfileView`
  и `versionName`, опциональный `disabled`; `change` передаёт типизированную
  команду одного поля (`SetCheckpointNoiseProfileChange`), `null` сбрасывает
  только это поле. Компонент не хранит библиотечную policy и не имитирует
  успешный Save: effective значения/источник возвращает владелец Main либо
  явно обозначенный prototype mock. ZTSNR switch и spacing select имеют
  доступные имена для конкретной версии; reset — маленькая secondary icon action.
  Assumed defaults и ручной override различимы. Project показывает read-only
  значения, editable controls остаются только в Model Manager. У простого
  `NSelect` этой версии Naive именованный root не имеет role=combobox, а меню
  не даёт role=option: проверяйте реальный DOM/API вместо предположения о ролях.
  Rich resource picker имеет собственный ARIA adapter и другой контракт.
  Правила native
  совместимости и fixed schedule определяет [контракт модели](../contracts/managed-model-library.md).

- **Размер и пропорции:** `v-model: ResolutionSize` (`width`/`height`: `number | null`)
  и `v-model:aspectRatio: AspectRatioState`; обязательный `max`, опциональные
  `min` (1), `step` (8), `disabled`, `widthLabel`, `heightLabel`, `swapLabel`,
  `widthFormat` / `heightFormat` (public Naive number formatting callbacks).
  Preset authoring uses the optional formatters to retain rejected raw input
  until correction and block persistence; existing consumers omit them.
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

## Production Smart Patch owned coherence controls

The [owned coherence scope](./phase-4-smart-patch-coherence-settings-research.md)
extends the selected Patch's existing Mask section in
[`ProjectView`](../../src/renderer/components/ProjectView.vue) and the prototype
with one shared component. Native14/prototype180 and required checks qualify
the scoped controls;native Save/recovery is separate from prototype mock history.
Render Coherence,Edge size and Minimum denoise as compact
labeled controls using the approved section spacing/theme. Mode exposes only
Gaussian Blur/Box Blur/Staged through public Naive `NSelect` options,value,size,
disabled,inputProps and keyboard APIs. Numeric fields use public `NInput` raw
string values/status/inputProps to retain invalid text without clamping.

Associate generated IDs with the real inputs,including a selector's public
`inputProps`;inspect installed Naive's actual focusable/accessibility target
instead of assuming its root has role=combobox. Closed mode text and all open
options remain readable;numeric fields stay compact like existing mask/Brush
controls. Edge has processing-pixel units;Minimum denoise is coherence minimum,
distinct from Generation's denoising strength. Do not add another primary Apply
action,new palette or a selection/hover-driven details layout shift.

The Project owner captures documentId/documentRevision/layerId and the complete
profile. Numeric Enter/blur or discrete mode selection emits a command intent;
the acknowledged Main view supplies stored values. One changed profile is one
Undo,not three independent overwritten commands. Invalid raw text does not
publish;Escape/owner/document/navigation change cancels. Stale/locked/busy state
must not commit an old draft or duplicate a blur/selection edit. Controls can
edit document state without an ML runtime;they do not claim Patch Generate is
available. Ordinary local v-model bindings use `defineModel` if composed into a
reusable wrapper;document metadata remains a read-only command-adapter input.

Defaults displayed for absent legacy `coherenceSettings` never issue a setter or
dirty the document. Compact controls,popup/focus,invalid/error and disabled states
require actual screenshots/interactions at standard/narrow windows;typecheck or
prototype mocks alone do not prove production Save/recovery. The later private
CPU capture reads the resolved frozen owned profile;this UI does not run
conditioning or create provenance/variants/preset fields.

## Production New Project preset customization

Production [`NewProjectModal`](../../src/renderer/components/NewProjectModal.vue)
uses `defineModel<boolean>('show')`. App supplies `busy`, `createError`, the
preset list/loading/error and model catalog/readiness; `create(ProjectCreateInput)`
and `refreshPresets` are intents. App owns the actual Create command and closes
only on success. Failed writes retain the form; reopening resets the transient
state. It composes the shared `PresetPayloadEditor` with selected sections,
section revisions and context/control/action slots, rather than reimplementing
its inputs. Size is always used, Seed starts unchecked, resets preserve Use.
The [detached state helper](../../src/renderer/components/new-project-preset-draft.ts)
captures active TXT values once and projects used fields into the strict
[Create contract](../../src/shared/projects/project-create.ts). Source IDs are
not sent; missing resources warn without blocking structurally valid creation.
The modal root is a direct element for the focus trap; only its body scrolls,
with a visible header/footer and one primary Create action.

## Production resource navigation

`ModelManagerFocus` is renderer-only browse intent: `resourceType` plus nullable
exact `resource` IDs/names. `modelManagerFocusFor()` projects saved references
without modifying them. Checkpoint, LoRA, VAE and embedding command adapters
emit this request; App owns the modal and existing catalog refresh on close.
Model Manager resets incompatible filters, but browsing and library Default
never call a Project selection setter. LoRA uses a text header action for the
category and the shared compact `IconButton` for an exact row. Saved embedding
Manage actions remain mounted during catalog checking so the modal can restore
focus to the same trigger; resolved diagnostics may disappear after repair.
[Evidence](./phase-2c-resource-handoff-research.md).

Model Manager presentation reads share `ModelManagerReadGuard`, with one opening
epoch and separate catalog/jobs/storage/token/refresh request owners. Check
currentness before applying success/error and after `nextTick` before scrolling;
only the owning refresh clears loading. `mergeModelManagerJobSnapshot` overlays
updates observed during the pending list without dropping untouched Main rows.
Successful token commands invalidate older status reads. This is presentation
ownership, not cancellation of Main commands or global event ordering.
[Evidence](./phase-2c-model-manager-read-research.md).

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

Named `defineModel<VaePrecision | null>('vaePrecision')` stores the optional
embedded-VAE policy in the same disclosure. A labeled public `NSelect` exposes
Auto/FP16/FP32; null displays Auto without a setter. The input receives the
generated label id through `inputProps`; filtering and keyboard navigation use
the public API. Reset removes the explicit policy. `vaePrecisionRuntimeSupported`
is advisory: an editable Illustrious draft can retain manual settings offline,
while Generate independently refuses unsupported manual precision. Unsupported
families disable the selector with an explanation; Reset remains reachable.
[Evidence](./phase-2c-vae-precision-research.md).

The `vae` slot contains production `ProjectVaePicker`: saved exact metadata is
read-only input; `select` sends only IDs or null, `relink` requests main's exact
portable check. It is a command adapter, not a writable metadata v-model.
Public `NSelect` uses `renderLabel` for the existing rich resource option and
`renderTag` for a compact selected name/version, with generated `inputProps`
label id. Default badges never drive automatic selection. Reset uses the shared
compact `IconButton` and remains available without a catalog or applicable
family; Anima's pinned VAE is explained. Missing/corrupt/portable states provide
diagnostics and Model Manager/relink. External VAE authoring explicitly keeps
Generate disabled until ML qualification. [Evidence](./phase-2c-external-vae-authoring-research.md).

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

Both production and prototype editors accept the current declared `modelFamily`.
Attention buttons and keyboard read it when invoked. Exact `anima` uses the
shared family-aware authoring analyser; other families retain existing behavior.
Do not infer family from displayed model names or cache the first mounted family.
The analyser preserves inner markup/literals and can refuse an ambiguous target
with an advisory. It does not own embedding refs or compile generation jobs.
Native sampling likewise uses a finite optional draft member and one Anima
selector, without defaulting an unset value or exposing an SD scheduler.
See [authoring research](./phase-2c-anima-authoring-research.md).

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

### Custom Naive modal root

`NModal` with a custom default slot uses a `div` as its direct rendered body
(or a Naive component such as `NCard` whose root is `div`). In the installed
`vueuc@0.4.65` focus trap, `getMainEl()` scans sibling elements for the first
`DIV`; a direct `section` is skipped and the trap redirects input focus to its
sentinel. Keep semantic dialog attributes (`role="dialog"`, `aria-modal`, name)
on the `div` and use semantic sections inside it. Do not disable focus trapping
to compensate. Qualify actual typing and Tab/focus as well as mouse clicks.

### Naive alert semantics

Installed Naive `NAlert` declares `role="alert"` in its render implementation;
an inherited `role="status"` does not override it. Use its actual alert role and
an explicit `aria-label` when inspecting diagnostics. Check the live accessible
tree and the installed component API instead of deriving the role from a Vue
call site. The Project Apply native qualification verifies this boundary.

## Regional Guidance reference-image authoring — finite native-r10 PASS, release complete

The current [reference-image owner](./phase-4-regional-guidance-references-research.md)
has **source implemented; finite native-r10 qualification PASS; retention/release complete**. Current source composes
`ProjectRegionalReferenceImages` inside the existing regional row; cards use
runtime-only `thumbnailUrl`, source name/format/dimensions, stable
`data-regional-reference-id` and document/region/reference keys. Only the bounded
full-frame WebP is displayed; the canonical original is not used as a tiny
`img`. Existing blocks stay mounted independently of selection. Whole controls
retain `data-entity-control`; Add/remove/reorder must not select an unselected
region or change Current Canvas/Smart draft ownership.

The visible Add text is `Reference Image`, with accessible name
`Add regional reference image`. It is eligible only for Current Canvas
`model.baseModelFamily === 'illustrious'`, independent of installed-model
readiness or selected Smart settings. Anima/unknown family has a visible reason;
existing references remain visible and repairable by remove/move in any family.
Disabled regions stay editable. Lock, ordinary/regional pending sync and lifecycle
guards disable mutations. Compact shared `IconButton` actions are labeled
`Remove reference <name>` and `Move reference <name> earlier/later`; boundary
moves use native disabled states. Thumbnail-load failure is a local placeholder,
not a document mutation. Resource/weight selectors and adapter menus are excluded.

Row events are `importReferenceImage(owner)` and
`updateReferenceImage(owner, change)`; LayerStack relays
`importRegionalReferenceImage(owner)` and
`updateRegionalReferenceImage(owner, change)`. ProjectView adds `tabId` to
those two events. App owns IPC and the exact operation lifetime. Exposed
`ProjectView.focusRegionalReferenceImport(originalOwner): void` is called only
after that import settles, its pending identity is released and props settle,
including cancel/error. Row guards the originating lifetime, owner/revision,
selection, stable context and intervening user focus; it does not infer success
from an unrelated busy transition. Existing prompt and rename focus behavior
must remain intact.

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

The prototype still uses SVG-capable `image/*`, multiple data URLs and mock
identities; it lacks production thumbnail/asset ownership, reorder/metadata and
family gates and is not evidence for this production flow. Earlier checkpoint
records below remain historical.

## Regional Guidance prompt authoring

The subsequent [owned-mask checkpoint](./phase-4-regional-guidance-masks-research.md)
has **source implemented, lower-level checks and finite native-r7 qualification
passed**; local visuals are root-reviewed and retention/release are complete.
Regional Canvas context has a
distinct owner kind and dedicated
edit event, never a fabricated Smart Patch. View adds the captured `tabId` to
`editRegionalMask(regionId, request)`; App drains prompt streams and revalidates
the original revision/mask owner before IPC without rebasing. Existing tool rail
controls and transform diagnostics are reused. Selected disabled regions remain
editable, locks refuse, and `overlayOpacity` affects only the isolated selected
mask overlay. Bbox/Fit remain absent. Root's Node, post-lint, build and prototype
checks PASS at the boundaries recorded in the linked research; production R2 is
CLEAN, source-only. Final native-r7 passes all 12 checks in 157.061 s with both
95-handler restorations complete and zero in-flight calls/page errors. Root opens
all six final 1440×900/900×620, quarter-turn and recovered screenshots without a
material local finding; this is bounded self-review, not a full accessibility
audit. Source R4/R5 are CLEAN, source-only. Historical failed attempts, including
native3's restoration gap, remain separate. All four retention audits are
CLEAN/READ-FINISHED and contract R2 is CLEAN, source-only. Final harness-scoped
lint passes; root exit/restoration/reader checks and exact cleanup are complete:
15 idle paths, 113,537,024 bytes (108.28 MiB), with compact proof and external
dependencies retained.

The current [authored-prompts checkpoint](./phase-4-regional-guidance-prompts-research.md)
extends `ProjectRegionalGuidanceRow` with optional durable inline blocks. Existing
blocks remain mounted independently of selection, keyed by document/region/
polarity rather than revision or pending state. The stable row attribute is
`data-regional-guidance-id`. Whole blocks use `data-entity-control`, preserving
the shared surface's independent selection and nested-control behavior.

Production `PlainPromptEditor` supplies text, syntax/attention actions and exact
ID-only `selectEmbedding` events; Main owns verification and trusted refs.
Optional `compact` preserves existing consumer defaults and action-rail space;
the public `focus()` handle supports guarded Add/Remove focus. No regional dynamic
preview is connected. Labels are `Regional prompt`, `Regional negative prompt`
and `Use global negative prompt`; Remove uses shared compact `IconButton` actions.
Add persists an empty block, Clear retains it and the last Remove omits `prompts`.
Add Negative starts local/empty; inheritance preserves dormant local text/refs,
whereas Remove Negative clears them and restores inheritance. The read-only
`Current Canvas negative prompt` display, model family and LoRA context come
from `projectGenerationDraft`, including when a Smart Patch is selected. Future
Smart-job freeze inheritance is outside this owner.

The row emits captured `updatePrompt(owner, change)` and
`sealPromptHistory(owner, historyGroupId)`; Stack/View relay dedicated regional
events, with View adding `tabId`. Dedicated prompt commands preserve metadata
APIs and ordinary generation-draft target/change validation. The shared seal
endpoint additionally accepts strict regional namespaced group IDs, while ordinary
draft group validation stays unchanged. Focus IDs use
`regional:<regionId>:<polarity>:<focusUuid>`. The dedicated per-document stream
serializes incremental writes and seals; no local CodeMirror Undo competes with
Project history. View applies regional overlays only to stack rows; capture and
other consumers retain acknowledged Project sources. Root supplies pending/
input-blocked/error state. Metadata is disabled separately from prompt input so
regional pending writes do not disable same-stream typing/block/source actions;
ordinary/Smart pending drafts block regional input. Lock blocks every prompt
write, while a disabled region stays editable.

Failed unpublished edits remain visible. The scoped error alert offers
`Retry regional edits` and `Discard pending regional edits`; discard retains
acknowledged Project changes. Same-field correction may supersede refused
unpublished text while exact embedding barriers and seal order remain protected.
Retry uses the captured revision; unrelated revisions or observed edit/Undo ABA
invalidate the stream permanently until explicit pending discard, without
rebasing. Add/Remove focus intents guard owner/revision, local epoch, selection,
unmount and intervening user focus. Existing Rename settlement remains a separate
qualified foundation behavior. The finite authoring checkpoint is root-qualified:
795 Node tests in 41 files pass with zero failures/skips before the final single
row ARIA attribute change. Final row 20c2fb6e has typecheck r7, later row/script
scoped lint and fresh app build r4 PASS; full lint r2 passes all four partitions.
Prototype r1 passes 182 shared-consumer browser checks without prototype source
changes. Complete production R4 and narrow ARIA R5 are CLEAN source-only;
final native-source R7 is CLEAN source-only.

Root's final native-r8, script ff502357, passes all 12 checks in 97.714 seconds,
with healthy final code 0 across two Electron lifetimes, intentional dirty
SIGKILL/recovery and healthy close. Both observer restorations are true with
inFlight zero, all handlers restored and zero page errors. The 675 first-lifetime
and 46 second-lifetime original calls each execute once. Full original arguments/
results remain in required `ipc/launch-*.jsonl` portable tagged journals; compact
witnesses reference journal prefixes. This evidence-format change adds no app API
or data-model change. All seven actual 1440×900/900×620 screenshots are opened and
viewed by root without material layout findings in scope. This is bounded
self-review, not independent full accessibility qualification. Historical failures,
including missing ARIA and failed setup attempts, remain failures in root research;
R5/R6 setup P1 findings close through getBuiltinModule/portable-codec corrections
and actual native-r8 execution.

Retention audits 1–4 are CLEAN and READ-FINISHED. Root completes fresh exit,
restoration and reader checks, removes 18 exact idle payload paths and reclaims
116,359,168 allocated bytes (110.97 MiB), preserving compact evidence and external
dependencies. Contract review R2 is CLEAN at source/document level. No regional masks/reference images,
conditioning, inference, installed embedding/autocomplete, active-work or Main-ABA
qualification is claimed. The prototype regional inputs remain plain textareas
with mock masks/reference images. Final evidence belongs to the linked root
research; PP-001/007/008 remain **Пока не обещать**.

## Regional Guidance foundation surface

At the [empty-entity checkpoint](./phase-4-regional-guidance-foundation-research.md), the UI
used `ProjectRegionalGuidanceRow` and the existing entity surface in a separate
Regional Guidance group above compositing Layers. Its shared selection/action
layout stays outside raster drag ordering and blend controls. The row owns its
rename dialog and captures document/revision/entity identity before deferred edits.
Opacity is displayed as percent and persisted as 0..1 for the future overlay.
Selection explicitly shows Current Canvas; no regional bbox or mask gesture is
admitted. At that checkpoint, unsupported Prompt, Negative Prompt, Reference Image
and transform/paint actions explained their unavailable state. Lock allows
selection, enable and unlock;
rename/opacity/duplicate/delete refuse. Legacy shared-stack consumers without a
valid document owner retain their layer controls and receive no regional commands.

Rename focus restoration retains an intent until both modal afterLeave and
terminal busy settlement. Captured document/revision/entity and local focus epoch, reopen,
unmount and user-focus guards prevent stale restoration or stealing focus.
This focus-only correction performs no queue or data writes. Root confirms the
original Escape→BODY causal native RED → full 12-check GREEN, followed by
independent R4/R5 clean source review of the adjacent slow/failed Rename fix.
The exact same focused harness goes from delayed-original and declared
IPC-transport-error focus RED (full state controls and ordinary success GREEN)
to 3/3 focus/state GREEN in `rename-focus-green-r1`, healthy exit code 0.
Only the focused transport-error case throws before the original Main handler,
with 0 original calls and no fabricated DTO; it does not prove Main service
atomicity. The full 12-check native mode retains original Main pass-through
without fault injection.

Final native-source R6 and contract R1 are clean. Root views the final native-r5
normal/minimum screenshots at actual 1440×900/900×620, plus recovered and
focused-error views, with no material UI issue in scope. All 182 full prototype
browser checks pass as shared-consumer controls; this owner changes no prototype
code. Historical failures/corrections remain retained. All retention audits are
clean; root independently verifies exit/restoration/readers and releases only the
15 declared temporary trees, preserving compact evidence and external dependencies.
