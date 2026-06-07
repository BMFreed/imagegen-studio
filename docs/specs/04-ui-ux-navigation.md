# UI / UX Navigation

## Основные зоны приложения

MVP строится как document-based desktop editor, ближе к Photoshop / Affinity / Krita, а не как Invoke-like набор равноправных разделов.

Основные top-level поверхности:

- `Home` tab — стартовый и организационный экран приложения: Workspaces, recent projects, new/open project, access to Model Manager.
- `Project` tab — открытый `.igs` document. Таких вкладок может быть несколько одновременно.
- app-level overlays/dialogs — Model Manager, Settings, Queue/Downloads, command palette.

`Canvas` не является primary navigation item или отдельной вкладкой приложения. Canvas — это сущность внутри `Project` tab: interactive рабочая поверхность открытого `.igs` проекта.

`Generate` не является отдельной рабочей зоной. Быстрая генерация с нуля начинается с создания нового `.igs` project и открытия его в `Project` tab.

`Model Library`/`Model Manager`, `Presets`, settings и queue/status UI остаются важными частями приложения, но не являются равноправными primary tabs. Их можно оформить как app-level dialog/overlay, panel, menu action или dedicated management window.

`Launchpad`, `Viewer` и постоянный Invoke-like Boards sidebar не входят в целевую навигационную модель.

## Home

`Home` является обычной вкладкой в document tab strip. Её можно закрыть, но пользователь всегда может открыть её снова через Home button/menu action. Если `Home` уже открыта, Home action фокусирует существующую вкладку.

Home screen не имеет левой и правой project/canvas-панелей. Его задача — дать пользователю спокойный стартовый экран и файловую организацию проектов:

- список/сетку workspace'ов;
- дефолтный workspace `Uncategorized`;
- thumbnails и basic metadata проектов;
- поиск/сортировку;
- recent projects;
- `New Project`;
- `Open Project`;
- `Manage Models`;
- создание, переименование и удаление workspace'ов;
- перемещение `.igs` проектов между workspace'ами;
- readonly preview проекта с нормальными tools для zoom/pan.

Readonly preview не должен показывать inactive canvas/generation controls. В нём доступны только действия просмотра и явные project actions: открыть, открыть в новой вкладке, переместить, переименовать, удалить, показать в файловом менеджере.

Workspace — плоская папка с `.igs` project files. Вложенные workspace'ы не поддерживаются. Вложенные папки и файлы не нашего формата игнорируются при сканировании.

## Project Tabs

`Project` tab сфокусирована на одном открытом `.igs` project. В ней находятся:

- interactive Konva-based canvas;
- layer stack;
- Smart Patch Layer controls;
- generation settings;
- model/LoRA/VAE controls;
- project resource warnings;
- project-local generation snapshots/history;
- save/autosave/recovery status.

Каждая `Project` tab имеет собственные:

- `.igs` file identity;
- dirty state;
- autosave state;
- undo/redo stack;
- canvas viewport state;
- selected layer/tool state.

Страниц `Project` может быть несколько одновременно. Каждая открытая `.igs` живёт в своей вкладке.

Один и тот же `.igs` категорически запрещено открывать в нескольких вкладках. Если пользователь пытается открыть уже открытый project file, приложение фокусирует существующую `Project` tab. Это правило действует для открытия из `Home`, recent projects, file picker, deep link, menu action и любых других entry points.

Boards/gallery не показываются как постоянная боковая панель Project. Управление проектами находится на `Home`, чтобы Project tab не конкурировала за внимание с файловой организацией.

### Opening behavior

Открытие проекта из `Home` работает как браузерная ссылка:

- left click по `.igs` project card открывает проект в текущей вкладке. Если текущая вкладка — `Home`, она заменяется на `Project` tab.
- middle click / Ctrl+click открывает проект в новой вкладке рядом с `Home`.
- right click показывает меню `Open`, `Open in New Tab`, `Show in File Manager`, `Move to Workspace`, `Delete`.
- если проект уже открыт, любое действие открытия фокусирует существующую `Project` tab вместо создания дубликата.

## Навигация

Для desktop creative tool лучше подходит спокойная рабочая оболочка:

- верхнее меню/app bar для глобальных действий: File, Edit, Project, Models, Window, Help;
- document tab strip: `Home`, затем открытые `Project` tabs;
- Home button/action, который фокусирует или заново открывает `Home`;
- верхняя строка для статуса worker'а, текущей модели, queue/download status и глобальных действий;
- центральная рабочая область;
- правая панель параметров для выбранного объекта внутри Project;
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
