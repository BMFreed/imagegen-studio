# Единая строка слоя и постоянные детали

2026-09-22, рабочее дерево поверх `2772f2c`. Продолжение
[Project UI polish](./project-ui-polish.md). Scope: композиция строк слоя,
типографика и отсутствие сдвига стека при выделении. Риск средний из-за общей
границы компонентов и команд; persistence/provenance не меняются.

## Причины и исправление

Прежний `ProjectEntitySurface` объединял только поверхность, а разметка заголовка
оставалась продублирована. Региональный title наследовал line-height 13px при
шрифте 13px и `overflow: hidden`, обрезая нижние части букв. Warning был отдельным
inline icon рядом с кнопками, у которых другое вертикальное выравнивание.
Условие `selected` монтировало/удаляло детали региона и Smart Patch, сдвигая соседей.

Теперь общий header целиком принадлежит `ProjectEntitySurface`: visibility,
selection button, название, summary, warning, lock и menu. Title имеет line-height
20px; summary — 17px. Warning и кнопки находятся в общей flex-группе, SVG имеют
одинаковый размер и совпадающие вертикальные центры.

Существующие региональные блоки и Smart Patch details всегда остаются в DOM и
видимы независимо от выделения. Optional blocks по-прежнему добавляются/удаляются
явными действиями. Это согласуется с InvokeAI `RegionalGuidance.tsx`, где
`RegionalGuidanceSettings` находится рядом с header без условия selection
(локальный reference checkout `685cb033eb`).

## Граница DI

- `project-entity-row.ts` задаёт типизированный `InjectionKey` и контракт
  `EntityRowController`: реактивное состояние представления, menu actions,
  select/toggle commands и необязательное состояние popover.
- `ProjectEntitySurface` получает контракт через `inject`. Он не импортирует
  типы слоёв, `ProjectSession`, историю, provenance или генерационные helpers.
  Общая UI-логика находится здесь; изменения документа выполняют внедрённые команды.
- `ProjectRasterLayerRow`, `ProjectSmartPatchLayerRow` и `ProjectRegionalRow`
  предоставляют контроллер через `provide`. Слоты `preview`, `header-actions`,
  `details`, `menu-overlay` задают специализированное содержимое.
- `useCompositingLayerRow` собирает общий адаптер команд Raster/Smart Patch,
  включая comparison и Create Preset from Result. Данные сравнения остаются
  в специализированных компонентах.
- `ProjectLayerRow` только выбирает конкретную реализацию и связывает прежние
  события с командами. `ProjectEntityThumbnail` объединяет геометрию миниатюр.

Каждый экземпляр строки предоставляет собственный controller. В частности,
редактирование или удаление второго региона не использует selected entity
или controller соседнего региона. DnD остаётся снаружи базового компонента,
его drag handle — общая selection button; поля деталей не запускают перетаскивание.

## Проверка и границы

Self-review, без пользовательского исследования. В
`tests/project-layer-rows.spec.ts` проверяются постоянная видимость деталей,
неизменные высоты/позиции при переключении трёх типов, выравнивание warning/lock,
независимые экземпляры региона, редактирование невыбранного региона, Undo и
команды visibility/lock для каждого типа. Две первоначальные проверки упали на
исходной реализации из-за отсутствующих редакторов; после исправления проходят.
Соседние tests проверяют DnD, variants, comparison, resource pickers и acceptance.

Один provenance test нажимал на подпись Smart Patch, которую теперь перекрывает
открытый comparison popover. Для click-outside используется canvas label;
проверки данных comparison и переключения вариантов сохранены.

Визуально проверены 1280×720, 1440×1000 и 1920×1000. Browser pass не обнаружил
runtime/Vue errors; сохранены локальные screenshots `project-layer-rows-*.png`.
Изменение выделения не раскрывает и не сворачивает строки; явное добавление
prompt/reference или изменение статуса всё ещё может менять их содержимое.

Финальные проверки рабочего дерева:

- `pnpm run prototype:test` — **112 passed**, 0 failed, 0 skipped;
- `pnpm run typecheck`, `pnpm run lint`, `pnpm run prototype:build` — успешно;
- `git diff --check` — успешно.

Сборка сохраняет прежнее предупреждение о размере JS chunk >500kB.
Публичные статусы product promises не повышаются: этот проход проверяет Vue-прототип.
