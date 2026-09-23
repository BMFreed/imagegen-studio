# Общие UI-компоненты прототипа

Это публичный контракт повторяемых элементов `docs/prototype-app`. Перед правкой
откройте сам компонент и его потребителей: сигнатура в коде остаётся источником
точных типов. Компоненты решают задачи представления; состояние Project и команды
остаются у владельца сущности. Браузерные проверки ниже доказывают поведение
Vue-прототипа, а не готовность production UI.

| Роль               | Компонент                                                                                                 | Текущий потребитель                                                                        |
| ------------------ | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Действие с иконкой | [`IconButton.vue`](../prototype-app/src/components/IconButton.vue)                                        | [`AppChrome.vue`](../prototype-app/src/components/AppChrome.vue)                           |
| Поверхность слоя   | [`ProjectEntitySurface.vue`](../prototype-app/src/prototypes/project/ProjectEntitySurface.vue)            | Raster, Smart Patch и Regional rows                                                        |
| Выбор ресурса      | [`GenerationResourceSelect.vue`](../prototype-app/src/components/generation/GenerationResourceSelect.vue) | Project Settings, LoRA stack, Preset editor                                                |
| Поле с подписью    | [`LabeledControl.vue`](../prototype-app/src/components/LabeledControl.vue)                                | [`ProjectLayersPanel.vue`](../prototype-app/src/prototypes/project/ProjectLayersPanel.vue) |

## Публичный API и инварианты

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

Проверки входят через настоящие страницы прототипа:
[`icon-button.spec.ts`](../prototype-app/tests/icon-button.spec.ts),
[`project-layer-rows.spec.ts`](../prototype-app/tests/project-layer-rows.spec.ts),
[`project-polish.spec.ts`](../prototype-app/tests/project-polish.spec.ts),
[`resource-select.spec.ts`](../prototype-app/tests/resource-select.spec.ts) и
[`labeled-control.spec.ts`](../prototype-app/tests/labeled-control.spec.ts).
После правки Vue/TypeScript запускайте `pnpm run typecheck`, после изменения UI —
`pnpm run prototype:test`.
