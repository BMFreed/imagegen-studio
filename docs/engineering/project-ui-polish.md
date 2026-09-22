# Project UI: слои, staging и выбор ресурсов

Коррекция от 2026-09-22: [единая строка слоя через DI и постоянные детали](./project-layer-rows.md).
Она заменяет описанное ниже раскрытие деталей только у выбранного слоя.

Дата: 2026-09-21. Проверяется рабочее дерево поверх `ed39eca`, включая новые
компоненты, fixtures и тесты. Это реализация замечаний и self-review после
[предыдущего прохода](./project-ui-pass.md), без исследования с пользователями.

## Диагноз и решение

Замечания указывали на три общие проблемы: свойства были отделены от объекта,
служебные поверхности конкурировали с изображением, а выбор ресурсов требовал
знать названия на память. Регион дополнительно использовал другую композицию
строки и другой hover, хотя воспринимается как сосед остальных слоёв.

| Проблема | Изменение | Наблюдаемый результат |
| --- | --- | --- |
| Большая карточка выбранного слоя под стеком | Opacity и Raster blend перенесены в общую строку над стеком; число в процентах и slider в popover | Свойство всегда находится в одном месте и следует за выделением |
| Regional Guidance визуально отделён от остальных слоёв | Общий `ProjectEntitySurface` для Raster, Smart Patch и региона; общие размеры header, icons, hover, selected и focus states | Hover не перекрашивает отдельный фрагмент строки; выбранный объект читается целиком |
| Региональные настройки вынесены в отдельный инспектор | Prompt, Negative Prompt и Reference Image раскрываются внутри выбранного региона | Можно добавить/убрать блок, редактировать текст, переключить global negative и добавить/удалить изображения |
| Постоянные кнопки вытесняют название | Duplicate/Delete и перемещение находятся в меню; visibility, lock и Smart Patch variants остаются рядом со слоем | Названия получают больше ширины; Raster и регион используют одинаковую схему действий |
| Staging превращён в большую панель с повторяющимися объяснениями | Миниатюры 64px и одна компактная строка команд поверх канваса | На проверенных стандартных размерах высота 110px, после сворачивания остаётся доступное Add |
| Боковые панели могут сузить канвас | Toolbar переносится в пределах канваса, Fit учитывает измеренную высоту staging | Кнопки доступны даже при ширине канваса около 199px; изображение не перекрывается полосой |
| Collapse controls у верхнего края | Кнопки отделены от tool rail и привязаны к середине viewport | Одинаковое положение при открытых и свёрнутых боковых панелях |
| Заголовок Create не помогает действию | Убран; панель начинается с Generate; подпись цели есть только для Smart Patch | Освобождена высота, сохранён контекст локальной генерации |
| Model/LoRA — список непрозрачных названий | Превью, base model и версия; у LoRA также triggers; поиск по имени/base/triggers | Ресурс можно узнать по содержимому и найти по триггеру; добавленные LoRA обозначены Added и недоступны для повторного добавления |

У выбранной модели превью сохраняется и в раскрытом меню. Закрытый selector остаётся
компактным. Общий resource picker используется в Project и `PresetPayloadEditor`,
а LoRA picker — во всех прежних consumers этого общего редактора.

## Сравнение с InvokeAI и направление дизайна

Использованы присланные изображения и локальные исходники InvokeAI на
`685cb033eb`. Checkout был обновлён до этой ревизии при предыдущем проходе
2026-09-21; в этом проходе Invoke не изменялся и заново не запускался.

Проверенные source paths относительно `invokeai/frontend/web/src/features/controlLayers/components/`:

- `CanvasEntityList/EntityListSelectedEntityActionBar.tsx` и
  `EntityListSelectedEntityActionBarOpacity.tsx`: свойства выбранной entity над
  списком, процент и всплывающий slider;
- `CanvasEntityContainer.tsx`, `RegionalGuidance/RegionalGuidance.tsx`,
  `RegionalGuidanceSettings.tsx`: общая поверхность entity, региональные блоки
  внутри контейнера;
- `StagingArea/StagingAreaToolbar.tsx`: небольшие группы команд рядом с изображением.

Из этих решений взяты расположение и иерархия. Семантика ImageGen Studio сохранена:
отдельная conditioning-секция Regional Guidance, единый compositing stack для
Raster/Smart Patch и несколько явно выбранных результатов для одного Add.

Контекст использования — автор изображения, работающий с промптом, регионом,
референсами, временными кандидатами и принятыми слоями. Палитра сохраняет тёмное
поле изображения, нейтральные панели, зелёное активное действие, фиолетовый регион
и предупреждение о совместимости. Основной объект экрана — изображение; controls
занимают ровно нужное место рядом с ним. Узнаваемая особенность — Smart Patch со
своими вариантами и явное принятие нескольких результатов.

Отвергнуты отдельная карточка-инспектор для каждого типа, постоянно открытая
высокая панель результатов, одноэлементный переключатель режимов и одинаковые
текстовые списки для ресурсов с разным содержимым. Новая декоративная палитра,
карточный dashboard и копирование полного workflow Invoke здесь не нужны.

## Поведение, риск и границы

Риск средний: изменены общие resource controls, композиция Project и локальное
редактирование через history. Supporting contracts:
[Project](../features/project/generate-mode/README.md),
[Regional Guidance](../features/project/generate-mode/regional-guidance.md),
[Generation Results](../features/project/generate-mode/generation-results.md),
[Generation Settings](../features/project/generate-mode/generation-settings.md).

Свойства и региональные edits проходят через `ProjectSession.document` и
существующий Project history. Текст объединяется в одну транзакцию до blur;
slider — до завершения изменения. Ошибка чтения reference file показывает
сообщение и не добавляет частичный набор изображений. Запоздалое чтение не
добавляет reference в уже удалённый регион.

Переключение предпросмотра меняет staging focus; checkbox selection отдельно
определяет `Add N`. Сворачивание оставляет Add доступным. Команды acceptance,
отмены незавершённых sibling jobs и grouped undo сохранены. Выбор LoRA не вставляет
триггеры в промпт; plain-text CodeMirror и embedding sidecars не изменены.

## Проверки

`tests/project-polish.spec.ts` содержит семь проверок через настоящий UI entry point:

| Граница | Инвариант и соседний случай | Какую ошибку различает |
| --- | --- | --- |
| Выбор слоя → properties → history | Opacity выбранного Raster сохраняется; соседний Raster остаётся прежним; Region меняет overlay и откатывается | Изменение не того слоя, потеря undo, region opacity без видимого эффекта |
| Regional row → document | Prompt, global negative, reference add/remove и delete откатываются | Локальный визуальный edit без записи в документ, потеря references |
| Staging → viewport/actions | 1280×720, 1440×900, 1920×1080; открытые/закрытые панели; узкий canvas после resize | Съехавший центр handles, обрезанные Add/actions, перекрытие изображения |
| Preview → acceptance selection | Next не меняет checked candidates, Clear selection отключает Add, collapse сохраняет Add | Неявное принятие текущего preview или недоступное действие |
| Resource search → draft | Поиск LoRA по trigger, выбор клавиатурой, защита от duplicate, смена модели без правки prompt | Сломанная keyboard navigation, потеря preview у выбранной модели, неявное изменение текста |

Проверки обнаружили и помогли исправить отсутствие имени на самом textarea,
сброс keyboard pending option после поиска, неполное rich-представление выбранной
модели и обрезание staging при широких панелях. Автоматический рост регионального
textarea вызывал ResizeObserver loop; теперь поле начинается с двух строк и
позволяет вручную менять высоту средствами Naive UI.

Старый Project test обновлён с удалённого текста `2 selected` на видимый
`Add 2 as Layers` и checked-state обоих candidates. Проверка provenance закрывает
popover через canvas label вместо удалённого Create header. Пользовательские
инварианты acceptance и immutable snapshot не ослаблены.

Финальные результаты на изменённом рабочем дереве:

- `pnpm run typecheck` — успешно;
- `pnpm run lint` — успешно;
- `pnpm run prototype:test` — **109 passed**, 0 failed, 0 skipped;
- `pnpm run prototype:build` — успешно; остаётся прежнее предупреждение о JS chunk >500kB;
- `git diff --check` — успешно.

После первого общего прогона (108 passed) добавлена проверка узкого canvas,
исправлены перенос staging toolbar и rich option выбранной модели. Итоговый
общий прогон выполнен повторно именно после этих изменений.

Отдельный browser pass: четыре сценария на трёх размерах, model/LoRA menus,
hover региона и Raster. Горизонтального overflow и runtime/Vue errors не получено;
canvas aspect ratio — 0.75. У обоих типов строк измерены одинаковые фон и рамка
hover, прозрачный фон selection button и высота header 52px.
Снимки: `docs/prototype-app/screenshots/project-polish-*.png` — локальные
generated artifacts, включая default, regional-guidance, staging, smart-patch,
model и LoRA menus.

## Что остаётся mock и что с Upscale

Публичная готовность promises не повышалась. Превью ресурсов — нарисованные
локальные SVG fixtures, а не примеры реальной генерации выбранной моделью.
Загруженные regional references живут в памяти сессии. Production `.igs`, worker,
маски, ресурсные metadata/weights и полноценный compositor этим проходом не
реализованы. Raster opacity/blend меняют состояние, но полноценное смешивание
пикселей остаётся за границей DOM/CSS-прототипа. Региональная opacity означает
прозрачность отображения области, а не силу conditioning.

**Upscale отложен, а не отменён окончательно.** Это согласовано в
[product scope](../specs/00-product-scope.md),
[Generation Actions](../features/project/generate-mode/generation-actions.md#upscale-follow-up)
и [MVP design §17.6](../mvp-design-doc.md#176-upscale-follow-up).
Он не входит в текущие Project acceptance criteria и не является публичным MVP
promise. Удаление Create header зафиксировано отдельно от этой отсрочки:
внутренний режим остаётся `generate`, видимое основное действие — `Generate`.
