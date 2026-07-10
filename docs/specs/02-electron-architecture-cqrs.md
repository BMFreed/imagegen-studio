# Electron Architecture And CQRS

## Граница процессов

Renderer отвечает за UI и пользовательские сценарии. Main process отвечает за application layer: SQLite, filesystem, загрузки, worker process, валидацию команд и нормализацию ошибок.

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

## CQRS-подход для MVP

CQRS здесь нужен как лёгкая дисциплина, а не отдельная enterprise-архитектура.

Commands меняют состояние:

```text
workspaces.create
workspaces.update
workspaces.removeRegistration
workspaces.rescan
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
presets.create
presets.update
presets.delete
canvas.createSmartPatchLayer
canvas.regenerateSmartPatchLayer
```

Queries читают состояние:

```text
workspaces.getList
projects.getIndex
models.getInstalled
models.getById
history.getRecent
history.getById
presets.getList
presets.getById
canvas.getProject
```

Events сообщают об изменениях и прогрессе:

```text
generation.progress
generation.done
generation.error
models.downloadProgress
models.downloadDone
models.downloadError
worker.statusChanged
```

## Практическое правило

Command handler может вызывать сервисы, писать в SQLite и публиковать events. Query handler только читает и формирует DTO для renderer. Это упростит тестирование и не даст UI случайно превратиться в скрытый backend.

Apply ownership следует preset-прототипу: `projects.applyPresetDraft` изменяет generation state конкретного открытого проекта из detached application draft. Команды `presets.create/update/delete` изменяют каталог presets; отдельной `presets.apply`, которая могла бы двусмысленно выглядеть как mutation исходного preset, нет.

`presets.create` принимает валидный `PresetDefinition` без fake identity и возвращает `PresetRecord`; id и timestamps появляются только после успешной команды. Ошибка команды не закрывает renderer draft. `projects.applyPresetDraft` принимает payload + ephemeral selection mask, но mask никогда не записывается в preset storage.
