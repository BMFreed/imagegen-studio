# UI / UX Navigation

## Основные зоны приложения

MVP строится вокруг двух основных рабочих зон:

- Workspaces — просмотр и организация `.igs` project files по workspace-папкам.
- Canvas — работа с открытым `.igs` project: generation, layer stack, Smart Patch Layer, mask/bounding box controls, model settings, snapshots.

`Generate` не является отдельной рабочей зоной. Быстрая генерация с нуля начинается с создания нового `.igs` project и открытия его в `Canvas`.

`Model Library`, `Presets`, settings и queue/status UI остаются важными частями приложения, но не обязаны быть равноправными primary tabs. Их можно оформить как панели, dialogs, command actions или dedicated secondary views, если это лучше поддерживает основной поток `Workspaces → Canvas`.

`Launchpad`, `Viewer` и постоянный Invoke-like Boards sidebar не входят в целевую навигационную модель.

## Workspaces

Workspace — плоская папка с `.igs` project files. Вложенные workspace'ы не поддерживаются. Вложенные папки и файлы не нашего формата игнорируются при сканировании.

Вкладка `Workspaces` не имеет левой и правой canvas-панелей. Её задача — дать пользователю спокойный просмотрщик и файловую организацию проектов:

- список/сетку workspace'ов;
- дефолтный workspace `Uncategorized`;
- thumbnails и basic metadata проектов;
- поиск/сортировку;
- создание, переименование и удаление workspace'ов;
- перемещение `.igs` проектов между workspace'ами;
- readonly preview проекта с нормальными tools для zoom/pan.

Readonly preview не должен показывать inactive canvas/generation controls. В нём доступны только действия просмотра и явные project actions: открыть в Canvas, переместить, переименовать, удалить, показать в файловом менеджере.

## Canvas

Вкладка `Canvas` сфокусирована на одном открытом `.igs` project. В ней находятся:

- interactive Konva-based canvas;
- layer stack;
- Smart Patch Layer controls;
- generation settings;
- model/LoRA/VAE controls;
- project-local generation snapshots/history;
- save/autosave/recovery status.

Boards/gallery не показываются как постоянная боковая панель Canvas. Управление проектами вынесено в `Workspaces`, чтобы Canvas не конкурировал за внимание с файловой организацией.

## Навигация

Для desktop creative tool лучше подходит спокойная рабочая оболочка:

- левая навигация между `Workspaces` и `Canvas`;
- верхняя строка для статуса worker'а, текущей модели и глобальных действий;
- центральная рабочая область;
- правая панель параметров для выбранного объекта в Canvas;
- project-local history/snapshots там, где она нужна работе с открытым `.igs`.

## MVP-состояния, которые нужно спроектировать заранее

- Worker unavailable / starting / ready / busy / failed.
- No model installed.
- CivitAI token missing.
- Download in progress.
- Generation in progress.
- Generation failed.
- Missing output file in history.
- Missing/corrupt `.igs` project.
- Autosave recovery available.
- Workspace path missing or inaccessible.
- Preset resource missing.
- Base model family warning.
- Smart Patch Layer outdated.

## UX-правило для пресетов

Действия `Apply settings from image` и `Save preset from image` должны быть визуально и текстово различимы. Первое меняет текущую форму генерации, второе создаёт новый редактируемый шаблон.

## UX-правило для Smart Patch

Mask, Bounding Box и Canvas Size должны быть разными секциями интерфейса. Пользователь не должен гадать, что именно он сейчас изменяет: размер всего проекта, область генерации или форму маски.
