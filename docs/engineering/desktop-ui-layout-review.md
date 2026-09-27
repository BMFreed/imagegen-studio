# Desktop UI: layout, action hierarchy and resolution control

Дата: 27.09.2026. Base: `73196af`; проверка относится к последующему working
tree. Это self-review реализации, не независимый аудит. Scope: уже подключённый
Electron UI и общие потребители редактора размера в Vue-прототипе.

Риск: medium для общего компонента и его проводки Create/Apply; low для layout
и оформления кнопок. Storage, IPC schemas, worker и правила Save не менялись.
Существующие пределы `.igs` сохранены; UI aspect presets не вводят новые
обещания о допустимых inference-размерах.

## Подтверждённые причины и исправления

| Наблюдение | Проверяемая причина | Исправление |
| --- | --- | --- |
| Home icon/description слева, New Project отдельно посередине | `HomeView.vue` задавал `display: block` корню `NEmpty`, чей API-компонент использует flex-column | Внешний `.browser-state` размещает целый `NEmpty`; loading и search-empty занимают ту же область |
| Два одинаково ярких New Project и Set up | Все три использовали `type="primary"` | Sidebar New Project остаётся primary; shortcut и setup/repair используют нейтральный `secondary` |
| Model Manager не заполняет модалку | Grid имел три строки, но условный feedback отсутствовал; body попадал в auto-строку, последняя оставалась пустой | Flex-column: header/feedback занимают необходимую высоту, body заполняет остаток |
| При сжатии окна детали/список становятся слишком узкими | Сохранённая ширина split не учитывала уменьшение всего окна | Публичный `NSplit.pane1Style` ограничивает текущую ширину panes; список сохраняет 320 px, детали — место для controls |
| New Project и Project используют разные редакторы размера | Отдельные width/height inputs в Electron и отдельный prototype size-card | Один `ResolutionControl.vue`: aspect presets, lock, swap, inputs и SVG preview; владельцы сохраняют свои команды |
| Лишний modal scrollbar после выбора aspect preset | `overflow: auto` на корне `NCard` включал геометрию `v-binder-follower-container` | Штатный `NCard.contentScrollable`, ограниченная высота и отдельный footer у New Project/import модели |

Также проверены App Chrome/tabs, Project settings и Canvas, Raster stack,
Home search/results, импорт модели и Project, close/recovery dialogs. В узком
окне Home actions и version actions переносятся; длинные model titles не
раздвигают details; sidebar/settings/layer scrollbars приведены к общей
компактной подаче. Цветовая схема пользователя сохранена.

## API и иерархия действий

Проверены исходники установленной Naive UI 2.44.1: Button props,
Empty styles, Card `contentScrollable`, Split pane props. Контракт общего
компонента и правила композиции внесены в
[ui-component-contracts.md](./ui-component-contracts.md).

Одна доминирующая primary-кнопка относится к пользовательскому контексту:
модальное подтверждение и selected-project Inspector могут иметь собственное
главное действие. Это соответствует исключениям в
[Carbon Button usage](https://carbondesignsystem.com/components/button/usage/).
Повторный shortcut и вспомогательный setup не требуют заполненного акцента;
[Naive Button API](https://github.com/tusen-ai/naive-ui/blob/main/src/button/demos/enUS/index.demo-entry.md)
предоставляет `secondary`, `tertiary`, `quaternary` без CSS-имитации.

## Проверка

- Настоящий Electron с отдельными временными XDG data/config, без изменения
  пользовательской библиотеки. Окна 900×620 (минимум из `src/main/index.ts`),
  1440×900 и 1920×1080.
- `scripts/desktop-layout-checks.mjs` вызывается из штатного `app:smoke`.
  Проверяет общий центр icon/description/action Home, одну primary-кнопку в Home,
  полную высоту трёх manager panes с feedback и без него, минимальные ширины и
  отсутствие overflow controls. Состояния: пустая и заполненная SQLite library,
  открытые details и ошибка Check updates без доступного token.
- New Project выбирает 5:4, получает 640×512 при вводе ширины, меняет стороны и
  preset, снимает lock и создаёт проект; существующий smoke затем читает
  настоящий `.igs` и проверяет размер. Это проверяет UI→IPC→writer, а не только
  helper с подготовленным значением.
- Дополнительный визуальный проход: 18 synthetic model records в настоящей
  SQLite, длинные name/version/description/trigger, overflow списка и деталей,
  import modal. Synthetic bytes не используются для вывода об inference.
- Чувствительность: CSS-mutation `display: block` на Home `NEmpty` делает
  центровочную проверку красной; восстановление — зелёной. Возврат
  `grid-template-rows: auto auto minmax(0,1fr)`/grid у manager shell делает
  проверку bottom alignment красной; восстановление — зелёной. Обе мутации
  выполнены на живом DOM, исходники приложения не оставлены мутированными.
- Численные правила общего control импортируются из production-модуля в
  `resolution-control.test.ts`: locked/unlocked edit, противоположный предел,
  area-preserving preset и очистка input. Prototype Home отдельно проверяет
  блокировку Create при пустом размере и полученный Project после Create.

Окончательный прогон working tree:

| Проверка | Результат |
| --- | --- |
| `pnpm run typecheck` | PASS: Electron и prototype |
| `pnpm run lint` | PASS |
| `pnpm run app:test` | 245 passed, 0 failed/skipped |
| `pnpm run app:smoke` | Все 7 Electron-сценариев прошли, включая новые layout/size checks |
| `pnpm run prototype:test` | 142 passed |
| `pnpm run app:build` / `pnpm run prototype:build` | PASS; сохраняется предупреждение Vite о chunk >500 kB |
| Две CSS-мутации | Обе обнаружены; после снятия мутаций проверки проходят |
| `git diff --check`, локальные markdown link targets | PASS |

При добавлении тестов исправлены две ошибки самого harness: измерение manager
во время modal transition и неограниченный label locator, захватывавший inputs
в неактивных Project tabs. Финальные проверки ждут конца transform-анимации и
выбирают активный Project через role; ограничения размера/геометрии не ослаблены.

## Дорожная карта и границы

[Roadmap](../specs/01-implementation-roadmap.md#текущая-карта-реализации-и-оставшихся-работ)
теперь содержит отдельные строки текущего состояния для Home, Model Manager,
Preset Manager, `.igs`, Canvas, generation draft, worker, results, export и
release. Для пропущенных Home/Trash/model remove/export flows назначены фазы,
зависимости и observable acceptance. Document shadow recovery уже реализован;
generation staging recovery относится к 2B, installable runtime — к 2A.
Синхронизированы устаревшие оговорки PP-001/002/003 и supporting contracts;
публичные статусы не повышены.

Этот проход не реализует отсутствующие production Presets, Generate, Smart
Patch/Regional tools, полный Home или updater. Dev worker в source-checkout
не подтверждает packaged runtime, реальные загрузки CivitAI, keyring или GPU
inference. Браузерный prototype suite доказывает его mock flows отдельно.
