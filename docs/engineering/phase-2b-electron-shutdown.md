# Phase 2B: Electron generation shutdown boundary

Проверяемый checkout: `755a8d5` + незакоммиченные изменения 29.09.2026.
Риск: **high** — выход приложения, подтверждение завершения worker и SQLite
queue. Этот checkpoint подключает владельца к Electron, но не открывает
пользовательский Generate.

## Ожидаемый путь

После успешного queue/staging recovery и создания настоящего RuntimeManager
Electron создаёт один `GenerationDispatchCoordinator`. Если recovery или runtime
недоступен, приложение сохраняет Home/Project и не создаёт coordinator.
`GenerationAppShutdown` связывает его с восстановленной очередью, runtime и
закрытием SQLite.

По запросу закрыть окно сначала выполняется существующий Save/Discard/Cancel
flow. Cancel оставляет generation и очередь без изменений. После подтверждения
закрытия приложение синхронно запрещает новые runtime probes и generation leases,
ждёт остановки активного worker, атомарно отменяет оставшиеся `pending` rows,
подтверждает выход проверочного/неудачно стартовавшего child, закрывает Project
tabs и SQLite и только затем закрывает окно. Обработчик
`will-quit` служит резервным async barrier для других путей выхода. В Electron
[`before-quit` предшествует закрытию окон, а `will-quit` следует за ним](https://www.electronjs.org/docs/latest/api/app),
поэтому остановка worker до пользовательского Cancel испортила бы действующий
close flow.

## Сохраняемые инварианты и отказные окна

| Trigger                                                   | Наблюдаемый результат                                                                                                                                                 |
| --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cancel в диалоге закрытия                                 | Окно остаётся, ожидающий job остаётся `pending`, coordinator не остановлен.                                                                                           |
| Поздний runtime status или generation request             | Новый probe/lease не запускается; уже начатая qualification завершается до закрытия SQLite.                                                                           |
| Неподтверждённый выход active/qualification/startup child | Барьер не закрывает SQLite и не разрешает закрыть окно. Повторная попытка снова проверяет exit.                                                                       |
| Ошибка отмены pending или подтверждения exit              | SQLite и окно остаются открытыми; повторная попытка не возобновляет остановленный dispatch. Runtime fence остаётся закрытым до перезапуска.                           |
| Подтверждённый exit                                       | Только `pending` rows становятся `canceled` с `USER_CANCELED`; frozen inputs сохраняются для явного retry. Running row уже должен быть завершён processor после exit. |
| Неожиданный сбой приложения                               | Старые `pending`/`running` rows по-прежнему отменяются startup recovery; валидные завершённые candidates остаются локально восстановимыми.                            |

`cancelPendingForShutdown` сериализуется внутри queue repository и требует
успешного recovery. Он не является глобальным enqueue fence. Сейчас нет Generate
IPC и другого пользовательского способа добавлять jobs, но перед его появлением
понадобится запрет новых enqueue во время app/Project close. Отдельное закрытие
Project через IPC пока не использует этот app-wide barrier. По продуктовому
контракту оно должно отменять только свои jobs и долговечно отбрасывать staging;
receipt tombstone, cleanup и UI подтверждения ещё не реализованы. Save сам по
себе staging не удаляет.

## Проверки и границы evidence

| Граница         | Проверено                                                                                                                                                                                                                               | Не доказано                                                  |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| Queue           | Настоящие SQLite/filesystem: отменяются только pending, sequence растёт один раз, input переживает reopen; race с другим claim не оживляет row.                                                                                         | Per-Project enqueue fence и discard.                         |
| Shutdown helper | Настоящая SQLite и управляемое событие exit: runtime fence → worker → pending cancel → context → DB; failure/retry, concurrent calls и runtime child без coordinator.                                                                   | Реальный GPU job в Electron.                                 |
| Electron        | Desktop smoke через native `app.quit()`: Cancel сохраняет окно и pending row; подтверждённый Save закрывает окно, сохраняет draft и переводит pending row в `USER_CANCELED`. Для этого smoke pending row вставляется напрямую в SQLite. | Renderer Generate, active inference job, staging acceptance. |

В изолированных worktrees semantic mutation отмены также `running` row
покраснила queue test; пропуск ожидания coordinator покраснил shutdown tests.
На dirty working tree прошли `pnpm run app:test` (389/389), `pnpm run
typecheck`, `pnpm run lint` и
`ELECTRON_OZONE_PLATFORM_HINT=wayland pnpm run app:smoke`. Smoke собирает
приложение перед запуском. Wayland hint нужен для точной проверки размеров
окна в текущей среде; без него известный Xwayland clamp останавливает smoke
раньше проверок lifecycle.

PP-005/007/008 остаются `Пока не обещать`: Electron теперь владеет внутренним
shutdown, но не запускает generation из UI и не предоставляет восстановление,
просмотр, принятие или безопасный discard candidates при Project close.
