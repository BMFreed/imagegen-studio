# Phase 2B: Electron generation shutdown boundary

Проверяемый checkout: `755a8d5` + незакоммиченные изменения 29.09.2026.
Риск: **high** — выход приложения, подтверждение завершения worker и SQLite
queue. Исходный checkpoint подключает владельца к Electron, но не открывает
пользовательский Generate. Ниже отдельно отмечено последующее изменение
per-Project close на рабочем дереве от `09bf0f9`; его проверки приведены ниже.

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

## Per-Project close extension: проверенный checkpoint

`ProjectGenerationClose` теперь объединяет renderer, typed IPC, восстановленные
queue/staging repositories и Project document close. Renderer после flush draft
запрашивает `getCloseImpact`: чистый Project с unfinished jobs или completed
unaccepted candidates также получает диалог. Cancel не вызывает close IPC;
для dirty Project Save/Discard остаются отдельными действиями. Подтверждение
передаётся в main явно. Если impact возник между предварительным чтением и
закрытием без подтверждения, main возвращает
`PROJECT_CLOSE_CONFIRMATION_REQUIRED`, а renderer перечитывает impact и
оставляет диалог открытым.

Main ставит Project-scoped fence до повторного чтения impact, отменяет и ждёт
только jobs этого Project, затем фиксирует tombstones staging sessions до
удаления candidate assets и закрывает документ. Если удаление файлов не удалось,
tombstones не дают восстановить уже отброшенный candidate после restart. Save
сам по себе staging не удаляет. Native app close теперь также собирает impact
открытых Projects до подтверждения выхода. Если generation recovery storage
недоступно, renderer и native close явно предупреждают и после подтверждения
сохраняют неизвестный staging для следующей попытки восстановления; выход из
приложения не блокируется из-за невозможности проверить эти файлы.

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
успешного recovery; это app-wide terminalization pending rows после остановки
dispatch. Для отдельного Project новый close owner использует собственный
fence, Project-scoped cancellation и staging tombstones. Generate IPC пока нет,
поэтому этот код ещё не доказывает пользовательский generation flow.

## Проверки и границы evidence исходного checkpoint

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

Эти результаты относятся к исходному app-shutdown checkpoint. Для extension
на рабочем дереве 29.09.2026 дополнительно прошли `pnpm run app:test`
(402/402), `pnpm run typecheck`, `pnpm run lint` и
`ELECTRON_OZONE_PLATFORM_HINT=wayland pnpm run app:smoke`. Electron smoke
проверяет clean Project с pending job: неподтверждённый IPC close возвращает
`PROJECT_CLOSE_CONFIRMATION_REQUIRED`, Cancel сохраняет row, подтверждённый
close переводит её в `USER_CANCELED` и создаёт session tombstone. Отдельный
Electron сценарий повреждённого generation recovery проверяет предупреждение,
Cancel и подтверждённое закрытие вкладки и окна с сохранением recovery; после
закрытия последней вкладки native close также предупреждает, а Cancel оставляет
Home открытым.
Repository tests на реальных SQLite/filesystem проверяют Project A/B isolation,
сбой после tombstone, повторную очистку, новый staging session после reopen и
claim/enqueue race. Изолированные semantic mutations удаления session-discard
guard и финальной queue fence-проверки покраснили соответствующие тесты.

Electron не проверял completed candidate в Project UI, active GPU worker,
dirty Project со staging, отказ Save или принятие результата в `.igs`: этих
пользовательских контуров пока нет. Для smoke pending row вставляется вторым
SQLite-подключением, которое остаётся открытым до завершения Electron; раннее
закрытие тестового подключения удаляло используемые Electron WAL/SHM и делало
чтение результата теста недостоверным.

PP-005/007/008 остаются `Пока не обещать`: Electron теперь владеет внутренним
shutdown и содержит новый путь подтверждённого per-Project discard, но не
запускает generation из UI и не предоставляет восстановление, просмотр или
принятие candidates в Project.
