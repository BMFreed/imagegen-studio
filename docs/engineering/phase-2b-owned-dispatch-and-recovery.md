# Phase 2B: retained recovery and owned generation dispatch

Проверяемый checkout: `299762d` + незакоммиченные изменения 28.09.2026.
Риск: **high** — жизненный цикл дочернего процесса, очередь и восстановление
временных результатов. Это внутренняя граница, а не готовый пользовательский Generate.

## Ожидаемое поведение и путь данных

После запуска Electron одна восстановленная пара SQLite queue и staging
остаётся в `GenerationAppContext` вместе с привязанными к ней processor и
orchestrator. Неудачное восстановление запрещает доступ к generation services,
не объявляя весь Project или базу данных недоступными. RuntimeManager выдаёт
эксклюзивный lease на один qualified generation worker: от live qualification
до завершения операции и подтверждённого выхода дочернего процесса. Status
во время lease не запускает второй CUDA worker. Внутренний
`GenerationDispatchCoordinator` может выполнить один pending job через этот
lease и при shutdown закрыть admission, запросить отмену и дождаться выхода.

Текущий путь Electron заканчивается после startup recovery. Main пока **не**
создаёт coordinator и не даёт renderer Generate/Results IPC. Внутренний
integration test вызывает coordinator напрямую; inference transport в нём
подставной. Отдельные real-child runtime tests проверяют владение процессом,
но не устанавливаемый ML runtime и не реальный GPU pipeline в Electron.

## Инварианты, отказы и выбор реализации

| Граница                  | Наблюдаемое состояние и восстановление                                                                                                                                            |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Startup recovery         | Queue и staging должны успешно восстановиться до claim/publication. Небезопасный staging path делает generation storage unavailable; Project DB остаётся доступной.               |
| Worker lease             | Если close не подтвердил exit, RuntimeManager или transport сохраняют владельца child и блокируют новые lease/probe. Повторное закрытие может подтвердить exit и освободить слот. |
| Shutdown во время claim  | Processor закрывает admission до нового dispatch. Если row уже взят из SQLite, он отменяется до вызова worker.                                                                    |
| Shutdown во время работы | Отмена выставляет `cancel_requested`; running slot и scratch удерживаются до подтверждённого exit. Только затем row становится `canceled`; поздний `done` не публикует candidate. |
| Project close            | `listUnfinishedByProject` даёт только read-only snapshot pending/running rows по локальной identity. Он не отменяет их и не реализует graceful close.                             |

Прямой запуск worker после cached `ready` оставил бы окно для второго CUDA
процесса и потери владельца при закрытии. Поэтому dispatch использует lease,
а status readiness остаётся advisory. Нельзя открыть UI Generate только на
основании этого среза: у него ещё нет видимого staging, acceptance,
provenance, полного MVP inference и корректного per-Project close.

Для graceful Project close нужен fence против нового enqueue, отмена именно
его pending/running jobs и долговечный discard временных candidates.
Удаление файлов staging само по себе небезопасно: crash между receipt,
manifest и SQLite completion может восстановить уже отброшенный candidate.
До реализации такого tombstone/cleanup flow текущая работа сохраняет
восстановимые результаты после сбоя и не удаляет их при закрытии Project.

## Проверки и пределы evidence

| Проверка              | Что подтверждено                                                                                                                                                                                       | Предел                                                                              |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------- |
| Queue repository      | Настоящие SQLite и файловая система: восстановление требуется для Project-scoped списка, статусы и identities не смешиваются, чтение не меняет rows.                                                   | Snapshot не заменяет повторную проверку при отмене.                                 |
| App context           | Настоящие SQLite и файловая система: одна сохранённая recovered pair, недоступность generation при unsafe staging, idempotent запрет новых запросов к context.                                         | Уже полученные references остаются пригодны; нет Electron IPC или активного worker. |
| Coordinator/processor | Настоящие SQLite, input и staging с подставным inference transport: completion, runtime unavailable, cancel во время claim и активной работы, ожидание exit.                                           | Это не system test renderer → IPC → GPU → Result.                                   |
| Runtime lease         | Реальный дочерний тестовый процесс: эксклюзивность, status без конкурирующего probe, смена pointer/config, неподтверждённый exit при работе, qualification и failed startup; retry без нового запуска. | Тестовый child не устанавливает runtime и не загружает пользовательский checkpoint. |

Изолированные semantic mutations проверили чувствительность ключевых тестов:
удаление запрета новых jobs при processor shutdown ломает тест отмены во время
claim; удаление lease-ветки status ломает concurrent-status тест; принудительный
успех startup-child retry ломает проверку неподтверждённого выхода. Каждая
мутация запускалась в изолированном worktree и была удалена.

На dirty working tree (а не только на `299762d`) прошли `pnpm run app:test`
(379/379), `pnpm run typecheck`, `pnpm run lint`, `pnpm run app:build` и
`git diff --check`. Проверки test/runtime не доказывают реальный managed GPU
release path.

Electron smoke собрал приложение и открыл окно, но не завершился: проверка
resize в `scripts/desktop-layout-checks.mjs:12` ожидала 1920×1080, тогда как
renderer остался 900×620. Причина этого сбоя не установлена; этот запуск не
считается успешной сквозной проверкой generation lifecycle.

Публичные PP-005/007/008 остаются `Пока не обещать`. Следующая проверяемая
граница — подключить один coordinator к Electron lifecycle вместе с
отменой/ожиданием перед закрытием SQLite, затем отдельно реализовать
per-Project close, staging UI и acceptance. Runtime installer, LoRA/Anima,
advanced inference и release GPU проверка остаются задачами roadmap.
