# Electron Architecture And CQRS

## Граница процессов

Renderer отвечает за UI и пользовательские сценарии. Main process отвечает за application layer: SQLite, filesystem, загрузки, app-owned Python runtime, worker process, валидацию команд и нормализацию ошибок.

Установка, проверка состояния и восстановление runtime — часть **того же
приложения и основного окна**, где находятся Home, Project и Model Manager.
ImageGen Studio не запускает отдельное приложение-лаунчер и не открывает
launcher-окно перед основным UI. Если worker ещё не установлен или неисправен,
основное окно всё равно открывается и показывает доступное действие setup/repair.
Python worker — фоновый subprocess без собственного пользовательского окна.
Исходники Invoke launcher в `/home/user/Work/sources/launcher/` служат
reference для отдельных install mechanisms, а не шаблоном композиции окон.

Renderer не импортирует:

- `fs`;
- `child_process`;
- SQLite driver;
- `ipcRenderer`;
- Python worker;
- произвольные shell-команды.

Все системные операции доступны только через доменный `window.api`, опубликованный preload-слоем.

## Single application instance

ImageGen Studio должен запускаться как single-instance desktop app.

Main process обязан использовать Electron `app.requestSingleInstanceLock()` на старте. Если lock не получен, второй процесс должен завершиться. Если lock получен, main process должен обрабатывать `second-instance` и передавать intent уже запущенному приложению.

Причина: project identity registry и autosave/recovery state должны существовать в одном runtime. Пользователь не должен иметь возможность открыть два независимых инстанса приложения и в каждом открыть один и тот же `.igs`.

Поведение:

- повторный запуск приложения фокусирует существующее окно;
- запуск приложения с `.igs` path, file association или deep link передаёт open-project intent в уже запущенный instance;
- существующий instance нормализует путь `.igs`, проверяет project identity registry и либо открывает новую `Project` tab, либо фокусирует уже открытую;
- второй OS process не должен создавать окно, открывать SQLite, запускать worker или менять autosave state.

Этот механизм не заменяет запрет дублей внутри tab manager. Он делает runtime registry единственным источником правды в рамках запущенного приложения, а tab manager всё равно обязан запрещать вторую вкладку для того же `.igs`.

## IPC best practices

- Использовать `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`.
- Не пробрасывать сырой `ipcRenderer`.
- Не делать универсальный `window.api.invoke(channel, payload)`.
- Описывать IPC channels в shared-модуле.
- Валидировать payload'ы в main process через runtime-схемы.
- Возвращать доменные DTO, а не внутренние ORM/SQLite-структуры.
- Для изображений и моделей передавать ID/пути, а не большие бинарные payload'ы.
- Каждая event-подписка должна возвращать unsubscribe-функцию.

### Минимальный runtime API фазы 0

`src/shared/api.ts` задаёт типы и разрешённые IPC channels для начального
`window.api.runtime`. Renderer видит только доменный API:

| Метод                       | Назначение                           | Результат                           |
| --------------------------- | ------------------------------------ | ----------------------------------- |
| `getStatus()`               | Прочитать текущую готовность runtime | `Promise<ApiResult<RuntimeStatus>>` |
| `install()`                 | Запросить установку runtime          | `Promise<ApiResult<RuntimeStatus>>` |
| `repair()`                  | Запросить восстановление runtime     | `Promise<ApiResult<RuntimeStatus>>` |
| `onStatusChanged(listener)` | Следить за сменой состояния          | `unsubscribe()`                     |

`RuntimeStatus` различает `not-installed`, `ready`, `needs-repair` и
`unsupported`; профиль первого релиза — `linux-nvidia` или `null`, когда
профиль нельзя выбрать. `detail` объясняет состояние без передачи traceback;
`runtimeId` присутствует только у известного установленного runtime.
`ApiResult<T>` содержит либо `{ ok: true, value }`, либо
`{ ok: false, error: { code, message } }`. Ошибки IPC нормализуются и не
разрешают renderer выбирать произвольный channel. Preload фильтрует форму
события перед вызовом listener и удаляет только собственную подписку.

В фазе 0 `install` и `repair` могут возвращать доменную ошибку
`RUNTIME_INSTALL_UNAVAILABLE`, пока проверенный artifact и staged installer
не реализованы в фазе 2A. Такой ответ не выдаёт runtime за готовый.
Подписку следует установить до первого `getStatus`, чтобы не пропустить
изменение между чтением и началом наблюдения. Реальная установка, self-test и
rollback остаются за main process по [runtime contract](./07-python-runtime-management.md).

## CQRS-подход для MVP

CQRS здесь нужен как лёгкая дисциплина, а не отдельная enterprise-архитектура.

Commands меняют состояние:

```text
workspaces.create
workspaces.update
workspaces.removeRegistration
workspaces.rescan
runtime.install
runtime.repair
projects.create
projects.importExternal
projects.rename
projects.move
projects.moveToTrash
projects.restore
projects.deletePermanently
projects.recover
projects.locate
projects.removeFromHome
projects.rebuildPreview
projects.applyPresetDraft
models.importFromCivitaiUrl
models.deleteLocalModel
generation.enqueue
generation.cancel
generation.discardCandidate
generation.discardStagingSession
projects.acceptGenerationCandidates
presets.create
presets.update
presets.delete
presets.restore
canvas.createSmartPatchLayer
canvas.regenerateSmartPatchLayer
```

Queries читают состояние:

```text
workspaces.getList
runtime.getStatus
projects.getIndex
models.getInstalled
models.getById
history.getRecent
history.getById
presets.getList
presets.getById
presets.getDeleted
canvas.getProject
```

Events сообщают об изменениях и прогрессе:

```text
generation.progress
generation.done
generation.error
generation.candidateReady
models.downloadProgress
models.downloadDone
models.downloadError
worker.runtimeInstallProgress
worker.runtimeInstallFailed
worker.runtimeActivated
worker.statusChanged
runtime.statusChanged
```

## Практическое правило

Command handler может вызывать сервисы, писать в SQLite и публиковать events. Query handler только читает и формирует DTO для renderer. Это упростит тестирование и не даст UI случайно превратиться в скрытый backend.

Apply ownership следует preset-прототипу: `projects.applyPresetDraft` изменяет generation state конкретного открытого проекта из detached application draft. Команды `presets.create/update/delete` изменяют каталог presets; отдельной `presets.apply`, которая могла бы двусмысленно выглядеть как mutation исходного preset, нет.

`presets.delete` устанавливает `deleted_at` и скрывает preset из активного
каталога, `presets.getDeleted` показывает восстановимые записи и срок истечения,
а `presets.restore` до 30-дневного срока снимает tombstone с той же identity.
Main process очищает просроченные записи отдельной idempotent maintenance
операцией при запуске и по расписанию во время работы; cleanup не вызывается
из renderer как пользовательское удаление. Это не Project Trash и не
физическое удаление модели.

`presets.create` принимает валидный `PresetDefinition` без fake identity и возвращает `PresetRecord`; id и timestamps появляются только после успешной команды. Ошибка команды не закрывает renderer draft. `projects.applyPresetDraft` принимает payload + ephemeral selection mask, но mask никогда не записывается в preset storage.

Generation ownership also has an explicit boundary: `generation.enqueue/cancel` and candidate-discard commands change queue/staging state, while `projects.acceptGenerationCandidates` is the only command that turns selected candidates into persistent Raster Layers or Smart Patch variants. It creates generation provenance and an immediate in-memory Project history projection as one grouped document mutation. Explicit Project Save synchronizes the durable derived global SQLite history index from accepted `.igs` results. Worker completion itself does not mutate the Project document.

## Python runtime ownership

Main process запускает worker только через runtime manager и только по абсолютному пути из атомарно записанного active-runtime manifest. Он не ищет `python` в `PATH`, не использует системный Python и не выполняет dependency installation внутри активного environment.

Runtime install/repair является main-process operation:

- получает и проверяет release artifacts;
- создаёт новый versioned staging runtime;
- выполняет dependency, backend и worker protocol self-tests;
- атомарно переключает active-runtime pointer только после успеха;
- сохраняет previous known-good runtime для rollback;
- нормализует install/runtime failures в доменные DTO.

Renderer может инициировать разрешённую install/repair command и показывать прогресс, но не получает доступ к `uv`, Python, `child_process` или произвольным shell-командам. Полный контракт зафиксирован в [Python Runtime And Dependency Management](./07-python-runtime-management.md).

Обновление Electron-приложения — отдельная main-process operation от обновления
Python runtime и моделей. Renderer в основном окне запускает проверку версии
только по нажатию `Проверить обновления`, показывает результат и отдельно
инициирует установку проверенного app
package; main process владеет загрузкой, проверкой и передачей пакета
platform updater'у. Даже при ошибке обновления app data, `.igs`, модели и
активный runtime не становятся объектом очистки. Точный Linux delivery/update
mechanism доказывается в [релизной фазе](./01-implementation-roadmap.md#фаза-5-первый-linuxnvidia-релиз).
