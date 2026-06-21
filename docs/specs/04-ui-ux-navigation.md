# UI / UX Navigation

## Основные зоны приложения

MVP строится как document-based desktop editor, ближе к Photoshop / Affinity / Krita, а не как Invoke-like набор равноправных разделов.

Основные top-level поверхности:

- `Home` tab — стартовый и организационный экран приложения: Workspaces, recent projects, new/open project, access to Model Manager.
- `Project` tab — открытый `.igs` document. Таких вкладок может быть несколько одновременно.
- app-level overlays/dialogs — Model Manager, Settings, Queue/Downloads, command palette.

`Canvas` не является primary navigation item или отдельной вкладкой приложения. Canvas — это сущность внутри `Project` tab: interactive рабочая поверхность открытого `.igs` проекта.

`Generate` и `Upscale` не являются top-level вкладками приложения. Это project modes внутри `Project` tab.

`Model Library`/`Model Manager`, `Presets`, settings и queue/status UI остаются важными частями приложения, но не являются равноправными primary tabs. Их можно оформить как app-level dialog/overlay, panel, menu action или dedicated management window.

Queue Manager является app-level surface. Он открывается из верхнего app chrome/menu/command palette и показывает generation/upscale jobs across projects. Он не является постоянной боковой панелью Project и не заменяет `GenerationResults`.

Загрузки моделей не получают отдельный Download Manager в MVP. Кнопка downloads в верхнем app chrome открывает Model Manager, сфокусированный на `Downloading` / install queue. Это быстрый вход в активные установки моделей, а не отдельная равноправная поверхность.

`Launchpad`, `Viewer` и постоянный Invoke-like Boards sidebar не входят в целевую навигационную модель.

## UX-язык и аудитория

ImageGen Studio проектируется не только для технически подкованных пользователей diffusion-инструментов. Значительная часть аудитории — люди, которые просто хотят генерировать и дорабатывать изображения.

Поэтому основной UI должен использовать человеческие формулировки: `Preview`, `Size`, `Open Project`, `Show in Folder`, `Generation is starting`, `Generation is unavailable`. Постоянные visible labels вроде `Worker ready`, `runtime`, `readonly`, `direct .igs files only`, `last scan` и похожие внутренние термины не должны попадать в основной интерфейс.

Технические детали допустимы в логах, диагностике, recovery dialogs и `Show details`, но не как обычная навигация или дефолтные подписи на Home/Project screens.

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
- preview проекта с нормальными tools для zoom/pan.

Preview на Home не должен показывать inactive canvas/generation controls. В нём доступны только действия просмотра и явные project actions. Постоянно видимые действия текущего прототипа: открыть, открыть в новой вкладке, переместить, показать в файловом менеджере. Более редкие действия вроде переименовать, удалить или relink должны жить в overflow/context menu.

В текущем Home-прототипе допустимы две primary-кнопки, потому что они принадлежат разным контекстам: `New Project` относится к выбранному workspace, а `Open Project` в Preview / Inspector относится к выбранному проекту. Это не должно превращаться в правило “много primary-кнопок в одной зоне”: внутри одной панели главный CTA должен оставаться один.

Workspace — плоская папка с `.igs` project files. Вложенные workspace'ы не поддерживаются. Вложенные папки и файлы не нашего формата игнорируются при сканировании.

Детальная спецификация Home screen: `docs/features/home-screen.md`.

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

Внутри `Project` tab есть project modes. В MVP в них входят:

- `Generate` — основной режим генерации и редактирования через canvas, слои, Smart Patch Layer, маски и model settings.
- `Upscale` — режим апскейла через ESRGAN-like модели. Он работает с immutable flattened composite input, полученным из текущего состояния `Generate`.

Детальная спецификация содержимого `Generate` mode: `docs/features/project/generate-mode/README.md`.

Переключатель `Generate | Upscale` должен визуально отличаться от верхнего document tab strip. В текущем Project-прототипе это компактный segmented control в верхней части левой settings panel, а не отдельный широкий ряд под вкладками.

Project tab не показывает отдельную строку с названием файла и статусом сохранения над рабочей областью. Название проекта, dirty marker и базовый статус документа принадлежат document tab/app chrome, чтобы не дублировать информацию.

`Canvas` остаётся общей сущностью Project. `Generate` использует его как основную рабочую поверхность. `Upscale` может показывать preview/input/result view, но не превращается в отдельный project document.

### Canvas side controls

В `Project` / `Generate` всегда видимы только базовые side controls:

- collapse left panel;
- `View`;
- collapse right panel;
- `Send Composite to Upscale` / `Send to Upscale` в правом canvas rail.

`View` является navigation/inspection tool, а не отдельным `Viewer` mode.

Contextual canvas tool rails появляются только для выбранных layer types:

- Smart Patch Layer: `Transform Mask`, Lasso, Polygon Lasso, Brush, Eraser, Bounding Box, `Fit Patch BBox to Mask`;
- Regional Guidance Layer: `Transform Region`, Lasso, Polygon Lasso, Brush, Eraser.

Raster Layer canvas editing в MVP не поддерживается. Для Raster Layer не показываются transform/crop/paint/filter tools.

`Fit Patch BBox to Mask` показывается только для Smart Patch Layer в его контекстном тулбаре. Для Regional Guidance Layer такая кнопка не показывается, потому что у Regional Guidance нет собственного generation bbox.

Canvas viewport controls живут в нижней compact bar у canvas: zoom, `Fit View` и contextual interaction hints. Изменение размера Project Canvas (`Fit Size to Layers`, grow/resize) находится в `Size` секции левой панели, а не дублируется в canvas toolbar.

Project Canvas size label и `...` canvas context menu позиционируются как overlays самой `canvas-area`: label сверху слева, menu сверху справа. Они не должны быть вложены в canvas frame так, чтобы перекрывать изображение.

### Generate → Upscale handoff

В режиме `Generate` должна быть команда `Send Composite to Upscale`.

Команда:

- берёт flattened composite видимых слоёв текущего Project;
- создаёт immutable upscale input asset внутри `.igs`;
- сохраняет metadata источника: source layer stack hash, canvas size, source snapshot/timestamp, visible layers metadata;
- переключает Project в режим `Upscale`;
- делает новый input активным для upscale job.

В режиме `Upscale` должна быть команда `Use Current Composite` / `Refresh Composite`, которая выполняет тот же handoff из текущего состояния Generate. Если слои или настройки композита изменились после предыдущего handoff, Upscale показывает состояние `Source is outdated` и предлагает refresh.

Upscale result в MVP должен поддерживать минимум:

- `Add as New Layer`;
- `Export`.

`Replace Source` можно отложить, потому что оно повышает риск destructive workflow.

Каждая `Project` tab имеет собственные:

- `.igs` file identity;
- dirty state;
- autosave state;
- undo/redo stack;
- canvas viewport state;
- selected layer/tool state.
- active project mode.

Undo/redo stack scoped strictly to this Project tab. Он не влияет на другие открытые `.igs`, queue status, Model Manager, Home или глобальные settings.

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
- compact queue/download activity buttons в верхнем app chrome;
- центральная рабочая область;
- правая панель параметров для выбранного объекта внутри Project;
- project-local history/snapshots там, где она нужна работе с открытым `.igs`.

Activity buttons в app chrome разделены по ownership:

- generation/upscale queue button открывает app-level Queue Manager;
- downloads button открывает Model Manager на установках/загрузках моделей;
- settings button открывает глобальные настройки приложения.

Когда app-level overlay открыт, document tab strip и рабочая область под ним визуально уходят в фон: dim/blur + pointer-events disabled. Верхнее меню и native window controls могут оставаться читаемыми как часть оболочки приложения, но вкладки не должны выглядеть доступными для прямой навигации за модальным слоем.

### App chrome

В MVP используем custom Electron titlebar/chrome по T3Code-like схеме:

- системный titlebar скрыт через Electron `titleBarStyle`;
- нативные кнопки окна остаются через `titleBarOverlay`;
- app menu row и document tab strip являются частью draggable titlebar region;
- интерактивные элементы верхней панели помечаются как no-drag regions;
- справа резервируется зона под native window controls через Window Controls Overlay geometry.

HTML-прототип может рисовать статичные кнопки окна справа, чтобы показать композицию chrome. В реальном Electron-приложении это место занимает native `titleBarOverlay`.

Горизонтальный логотип находится в menu row. Высота menu row — около 40px, чтобы логотип оставался читаемым без перегруза верхнего chrome.

Project tab marker использует цвет workspace. Цвет workspace можно менять вручную, а для новых workspace'ов он генерируется автоматически. `Home` tab использует home icon вместо workspace color marker.

## MVP-состояния, которые нужно спроектировать заранее

- Generation engine unavailable / starting / busy / failed.
- No model installed.
- CivitAI token missing.
- Download in progress.
- Generation in progress.
- Generation failed.
- Missing output file in history.
- Missing/corrupt `.igs` project.
- Autosave available / recoverable project state.
- Workspace path missing or inaccessible.
- Preset resource missing.
- Base model family warning.
- Smart Patch Layer outdated.

## UX-правило для пресетов

Действия `Apply settings from image` и `Save preset from image` должны быть визуально и текстово различимы. Первое меняет текущую форму генерации, второе создаёт новый редактируемый шаблон.

## UX-правило для Smart Patch

Mask, Bounding Box и Canvas Size должны быть разными секциями интерфейса. Пользователь не должен гадать, что именно он сейчас изменяет: размер всего проекта, область генерации или форму маски.

Smart Patch Layer описан как отдельная feature-сущность в `docs/features/project/generate-mode/smart-patch-layer.md`. Этот документ является рабочим источником правил ownership для layer-owned mask, layer-owned bounding box, internal resolution и raster sub-layers.

Для выбранного Smart Patch Layer точное редактирование bounding box оформляется как компактная кнопка/бейдж `Bounding Box` в selected-layer controls. Кнопка открывает popover с x/y/width/height, internal resolution, aspect lock, fit-to-mask, fit-to-canvas и scale-before-processing. Прямое редактирование bbox handles на canvas остаётся основным способом работы, popover нужен для точных значений.

Основная видимая команда `Fit Patch BBox to Mask` находится в контекстном тулбаре Smart Patch Layer. В bbox popover она может дублироваться как precision/action command, но не является глобальной командой canvas toolbar.
