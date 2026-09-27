# Общие UI-компоненты

Это публичный контракт повторяемых элементов Electron renderer и `docs/prototype-app`. Перед правкой
откройте сам компонент и его потребителей: сигнатура в коде остаётся источником
точных типов. Компоненты решают задачи представления; состояние Project и команды
остаются у владельца сущности. Браузерные проверки ниже доказывают поведение
Vue-прототипа, а не готовность production UI.
Общий редактор размера используется в обоих контурах; его production-проводка
проверяется отдельно через Electron.

| Роль               | Компонент                                                                                                 | Текущий потребитель                                                                        |
| ------------------ | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Действие с иконкой | [`IconButton.vue`](../prototype-app/src/components/IconButton.vue)                                        | [`AppChrome.vue`](../prototype-app/src/components/AppChrome.vue)                           |
| Поверхность слоя   | [`ProjectEntitySurface.vue`](../prototype-app/src/prototypes/project/ProjectEntitySurface.vue)            | Raster, Smart Patch и Regional rows                                                        |
| Выбор ресурса      | [`GenerationResourceSelect.vue`](../prototype-app/src/components/generation/GenerationResourceSelect.vue) | Project Settings, LoRA stack, Preset editor                                                |
| Поле с подписью    | [`LabeledControl.vue`](../prototype-app/src/components/LabeledControl.vue)                                | [`ProjectLayersPanel.vue`](../prototype-app/src/prototypes/project/ProjectLayersPanel.vue) |
| Размер и пропорции | [`ResolutionControl.vue`](../../src/renderer/components/ResolutionControl.vue) | Electron New Project/Project bbox; prototype New Project/Project Size |

## Публичный API и инварианты

- **Размер и пропорции:** `v-model: ResolutionSize` (`width`/`height`: `number | null`)
  и `v-model:aspectRatio: AspectRatioState`; обязательный `max`, опциональные
  `min` (1), `step` (8), `disabled`, `widthLabel`, `heightLabel`, `swapLabel`.
  Слот `actions` добавляет контекстный Fit. Preset соотношения включает lock,
  изменение стороны с lock сохраняет пропорцию в пределах bounds; swap меняет
  стороны и preset; ручной unlock оставляет текущие размеры. SVG preview
  отражает текущие размеры. Очистка input передаёт `null`, а не сохраняет
  скрыто прежнее значение: блокировка Apply/Create принадлежит форме.
  Внешнее изменение bbox с другой пропорцией снимает lock, не откатывая bbox.
  Компонент не знает ProjectSession, IPC, undo или preset payload. Production
  владелец применяет размер только через Create/Apply; prototype wrapper —
  через свою существующую команду. `max` задаёт владелец: предел `.igs` не
  является обещанием доступной GPU resolution. Общие TS-типы и алгоритмы
  находятся в [`resolution-control.ts`](../../src/renderer/components/resolution-control.ts).
- **Действие с иконкой:** обязательные `icon: Component` и `label: string`;
  опциональные `compact`, `disabled`, `loading`, `pressed`, `tooltip` и
  `badge: { dot?, value }`; событие `click`. Кнопка занимает 32 px, в `compact`
  — 24 px; место под иконку и её CSS-размер — 18 px. `label` остаётся доступным
  именем, `tooltip` меняет только подсказку (по умолчанию она равна `label`).
  `disabled` и `loading` не запускают команду. Tooltip вынесен в портал за
  пределы контейнера с `overflow: hidden`.
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
