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
models.importFromCivitaiUrl
models.deleteLocalModel
generation.enqueue
generation.cancel
presets.create
presets.update
presets.apply
canvas.createSmartPatchLayer
canvas.regenerateSmartPatchLayer
```

Queries читают состояние:

```text
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
