# Фаза 3: production Preset Manager

Base: `8cbf0e3e7eb31388ee12af1a60f9404cdd808dc6`, `master`.
Scope: approved three-column manager → existing typed preset API → SQLite.
Risk high: explicit persistence/delete commands and protection of unsaved edits.
Contracts: [PP-006](../product-promises.md#pp-006-настройки-генерации-можно-сохранять-и-переиспользовать),
[Presets](../features/presets.md), [component APIs](./ui-component-contracts.md).

Before editing: prototype resource references are mock `{id,name}`, its defaults
invent resources and Duplicate copies unsaved edits. Production stores exact
IDs/SHA/CivitAI metadata, requires meaningful included sections and duplicates
the persisted record. Therefore preserve approved presentation while composing
production exact-resource controls and a detached manager session.

Required invariants:

- Home Tools, Project settings and Project menu open the same modal. No Apply,
  Save Current/Result, import/export or live link to a Project in this slice.
- Manual draft: TXT, empty name, only empty Prompt. Pinned Draft outside filters,
  no identity before successful Create. Editor inclusion is field presence;
  empty LoRAs and explicit Embedded VAE remain meaningful.
- Twelve sections derive from shared schema; production plain-text CodeMirror,
  existing resolution component, real catalog refs with no Default substitution.
  Missing/incompatible resources warn and remain saveable; prediction/noise policy
  is not edited here. Invalid numeric drafts remain editable and block Save.
- Detached metadata/payload until successful writes. Failed writes preserve the
  same draft and pending guarded navigation; stale reads cannot replace it.
- Close/Esc/switch/New/Deleted and dirty Duplicate use Save/Discard/Cancel.
  Window close also waits for this guard before acknowledging Main. Obscured
  Project Save/Undo shortcuts do not change its document.
- Confirmed Delete affects only that preset, explains recovery for 30 days and
  unchanged projects. Deleted is read-only with expiry/Restore. Main owns expiry.
- Bounded mouse-resizable columns, list/editor scroll to bottom, visible footer,
  one primary Save/Create action. Prototype palette/layout preserved.

Parameters: existing portable limits (16MiB definition, 1024-byte name,
1MiB prompt/description, 8..32768 size, uint32 fixed seed), existing thirty-day
repository retention and hourly sweep. Resizable sidebar190..260px, list/editor
bounded against minimum desktop900×620; these are layout choices, qualified at
1380×900 and900×680 rather than claims of smaller-window support.

Planned evidence: real session+SQLite/reopen, delayed/refused transport seams,
semantic mutation of write failure protection; built native UI create/edit/save/
duplicate/delete/restore/restart, invalid draft and Close/Escape guards, actual
trigger-induced SQLite failure/retry, unchanged neighboring Project `.igs`/history/
seed and model rows. Inspect actual screenshots/geometry; HTTP mock screenshots
alone cannot prove native persistence. CPU-only, serial bounded checks, no ML.

This initial section is prospective; execution results follow after verification.

## Реализация и границы

Ручной Manager подключён из Home, Project и Project menu к настоящему
`PresetApi`/preload/Main/SQLite. `PresetManagerSession` владеет detached draft,
guarded navigation и публикацией результатов команд; Vue-компонент отвечает за
представление. `PresetPayloadEditor` собирает двенадцать shared-секций, точные
resource refs и production plain-text prompt editor. В TXT strength скрыт и
исключается при смене workflow. Нет записи до Create/Save, связи с Project,
подстановки Default version или редактирования prediction/noise policy.

Save сохраняет раскрытые секции. Discard/смена записи заменяют редактор и его
raw validity state. На отказ запись остаётся transient, код
`PRESET_STORAGE_FAILED` виден пользователю, тот же черновик можно сохранить
повторно. Delete требует отдельного подтверждения; Deleted показывает
неизменяемое определение, дату окончания recovery и Restore. Время/окончательное
удаление по-прежнему принадлежат Main repository, не UI.

Window close теперь спрашивает готовый renderer и на Home без Project tabs.
Request-scoped сигнал ожидания Save/Discard/Cancel приостанавливает десятисекундный
flush watchdog; при записи watchdog возобновляется. Sender, main frame, request ID
и тип сигнала проверяются. Reload/crash/destroy завершает ожидание ошибкой.
Обычный Cancel не показывает системный error box и не завершает shutdown.

## Существенные находки и исправления

- В installed `vueuc@0.4.65` modal focus trap ищет direct `DIV`. Наш `section`
  заставлял фокус уходить из NInput на sentinel; реальные input/focus traces
  опровергли первоначальное предположение о потере draft при Cancel. Root заменён
  на `div`; правило записано в component contract. Отключение native input
  isolation не исправляло дефект; этот диагностический control не принят как GREEN.
- В NCheckbox с собственным label generated `aria-labelledby` перекрывал
  `aria-label`. Explicit Included names теперь относятся к действительным
  checkboxes, а не только к их визуальному окружению.
- Naive может сохранять старый numeric model при незавершённом вводе. Raw input
  валидируется отдельно и сохраняется через публичный `format`; Save, Ctrl+S и
  guard Save блокируются. Input наблюдается после внутреннего обработчика Naive:
  capture плюс синхронная validation-публикация сбрасывали видимое `-` к старому
  числу. Настоящий UI проверяет и Steps, и отдельный путь ResolutionControl.
- Публикация `busy=false` до применения успешного Delete могла открыть ложный
  close guard уже удалённого draft. Команда применяет ответ перед idle notification.
- Фиксированный pane minimum вместе с процентным Split выводил editor/footer
  за край компактной модалки. ResizeObserver измеряет доступную ширину; публичные
  min/max Split ограничивают ratio после изменения окна и sidebar. List сохраняет
  250 px; editor получает 360 px, когда это помещается, иначе фактический остаток.
- Ctrl+Z/redo с фокусом на кнопке запускал browser editing history для последнего
  textarea. В Manager вне editable target этот shortcut подавлен. Внутри input
  обработка остаётся у самого редактора; отдельная история всего preset draft
  этим checkpoint не квалифицируется.

## Исполненное evidence

Это self-review working tree относительно base выше; делегированные проверки
стыков не являются слепым аудитом. Все прогоны CPU-only и serial, без модели,
worker, inference, downloads или копий ML runtime.

Evidence root:
`~/.codex/artifacts/imagegen-studio/runs/preset-manager/20261013-checks/`.
Команды и настоящие process/cgroup identities сохранены в `*.bounds.json`;
stdout каждого запуска — в отдельном `*.log`.

| Граница                                         | Проверка и результат                                                                                                                                                                                                       |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Typed editor/session → реальный SQLite и reopen | `focused-delivery-pass`: 80 passed, 0 failed/skipped; editor, session, repository, service, IPC/schema, resolution control и neighboring app shutdown                                                                      |
| Built Electron UI → preload/Main → SQLite       | `native-pass/report.json`: **16 passed**, 0 page errors, два настоящих запуска/physical exits                                                                                                                              |
| Explicit writes и отказ                         | UI Create/Edit/Duplicate/Delete/Restore; настоящий SQLite INSERT trigger вызывает отказ, draft остаётся доступным для retry; trigger удалён                                                                                |
| Guards/keyboard                                 | Cancel/Discard/Save при Close/Esc/switch/New/Deleted/Duplicate; настоящий BrowserWindow.close на Home с нулём Project tabs; независимый Main heartbeat после 11 секунд не наблюдает error box; Cancel сохраняет окно/draft |
| Raw numeric input                               | `-` остаётся видимым после Ctrl+S/blur/Cancel и не записывает прежние Steps/width; исправленные числа сохраняются, excluded section отсутствует                                                                            |
| Resource identity                               | Missing checkpoint/LoRA/VAE/embedding refs предупреждают и сохраняются без подстановки при metadata Save и после рестарта                                                                                                  |
| Соседний control                                | Project `.igs` bytes, generation draft/history, model/database rows и document-scoped operational/fixed seed **0** неизменны при командах Manager                                                                          |
| Визуальная поверхность                          | Открыты actual native screenshots при 1380×900, 900×680, конце списка и после перетаскивания обоих divider; editor/footer в modal bounds, scroll до дна, не более одного primary action                                    |
| Существующий shared control                     | `prototype-resolution`: 1 passed; New Project/Project preview и соседние controls не обрезаны. Это prototype layout evidence, не persistence                                                                               |

Семантические mutations выполнены только в изолированной копии настоящего
session/repository, не в production source:

- Close обходит dirty guard: **4 RED / 8 GREEN**.
- Failed command заменяет draft пустым: **1 RED / 11 GREEN**, падает именно
  preservation/retry test, который сравнивает независимый snapshot значений.
- Idle публикуется через async boundary до persisted response: **1 RED / 11 GREEN**,
  падает busy Delete/close test после настоящего repository Delete.
- Byte-exact restoration и повторный исходный набор: **12 GREEN**.

После финального форматирования delivery source также восстановлен в копии
byte-exact и повторно прошёл **12 GREEN** (`delivery-copy-green`). Его minified
compiled emission совпадает с исходным mutation candidate;
`delivery-restoration.json` фиксирует оба source SHA и общий compiled SHA.

Первая слишком широкая navigation mutation также вводила рекурсивный Duplicate.
Она сохранена как superseded diagnostic и не включена в эти три результата.
Начальные type/lint/setup failures, failed screenshots и reports не выдаются за
successful runs. Последний release attempt прошёл 16 behavior checks, но упал
при повторном Close во время leave transition: harness теперь ждёт исчезновения
модалки перед native cleanup, после чего весь `native-pass` завершился успешно.
Full lint дополнительно нашёл прежний redundant non-null assertion в соседнем
resolution test; удалён только лишний assertion operator, сами проверки сохранены.

Native source/bundle SHA совпали с проверяемым tree. Native peak вместе с owned
actor/scopes — **677 MiB**, swap 0; actor и app ограничены 2 GiB каждый, app deadline
300 секунд, внешний deadline 600 секунд. Typecheck/lint используют отдельный
serial cap 6 GiB, swap 0. Никакие protected shared ML dependencies не использованы.

## Оставшийся scope

PP-006 остаётся «Пока не обещать». Следующий срез — Project Apply с editable
detached application draft, full/partial copy и selected-resource diagnostics.
Save Current, New Project customization, result-to-preset и Models handoff ещё
открыты. Этот запуск не квалифицирует populated installed-resource picker,
отдельную preset prompt/draft history, arbitrary storage corruption, upgrade
старого релиза, trained inference или distribution packaging. Startup/30-day
purge подтверждены прежним storage checkpoint, не выдаются за новые UI проверки.

## Завершение

Финальные `pnpm run typecheck`, `pnpm run lint`, `pnpm run app:build` и
`git diff --check` прошли. Обязательные TS/Vue consumers проверены; полный
prototype UI набор не запускался, потому что prototype source не менялся,
а добавленные format props shared control не меняют его прежние defaults.

После подтверждения physical exit всех owned process/cgroups и восстановления
mutation source удалены только agent-generated payloads данного запуска.
Освобождено **103542784 bytes (98.7 MiB)**; evidence занимает около **2.75 MiB**.
Reports/logs/screenshots, mutation snapshots и небольшой исходный соседний `.igs`
сохранены. Fixtures из `fixtureRoot` в старых reports уже disposed; сами reports
и `native-pass/neighbor-project.igs` доступны. Подробности — `cleanup-report.json`
и `artifact-lifecycle.json`. Protected shared runtime/catalog не затронут;
новых тяжёлых dependency exceptions нет.
