# UI / UX Navigation

Для Home, Project, Model Manager и preset-system текущие visible labels, default states и переходы сверяются с `docs/prototype-app` и его Playwright tests. Этот документ объясняет navigation ownership и production intent. Принятое решение о бесконечном Project Canvas пока опережает конечный canvas в прототипе; этот разрыв описан ниже и не считается реализованной возможностью.

Навигация следует [PP-001: Понятный интерфейс вместо собираемого workbench](../product-promises.md#pp-001-понятный-интерфейс-вместо-собираемого-workbench). ImageGen Studio владеет основной композицией экранов и не предоставляет IDE-like docking, произвольную замену primary panels или layout presets, способные изменить назначение Home, Project или domain mode. Bounded resize, collapse и настройка плотности допустимы, пока они не меняют информационную архитектуру и сохраняются предсказуемо.

Controls и domain entities следуют [PP-002](../product-promises.md#pp-002-явное-намерение-вместо-магического-control) и [PP-003](../product-promises.md#pp-003-одна-сущность-один-владелец-и-одно-каноническое-место). Search не создаёт сущности, mutation имеет явный verb, setting располагается у своего domain owner, а несколько contextual entry points фокусируют одну canonical surface вместо создания конкурирующих Gallery/Manager-представлений.

## Основные зоны приложения

MVP строится как document-based desktop editor, ближе к Photoshop / Affinity / Krita, а не как Invoke-like набор равноправных разделов.

Это сравнение относится к document ownership и ясной task-oriented композиции, а не к полному набору DCC-возможностей. ImageGen Studio не обещает Photoshop-like dockable workspace: фиксированная продуктом структура является сознательным обменом произвольной layout-гибкости на понятность и устойчивую мышечную память.

Основные top-level поверхности:

- `Home` tab — стартовый и организационный экран приложения: Workspaces, `Projects`, new/import project и доступ к Model Manager и Preset Manager.
- `Project` tab — открытый `.igs` document. Таких вкладок может быть несколько одновременно.
- app-level overlays/dialogs — Model Manager, Preset Manager, Apply Preset, Settings, Queue Manager и task dialogs.

`Canvas` не является primary navigation item или отдельной вкладкой приложения. Canvas — это сущность внутри `Project` tab: interactive рабочая поверхность открытого `.igs` проекта.

`Generate` не является top-level вкладкой приложения. Это domain mode внутри `Project` tab; отдельный `Create` header или однопунктовый mode switch не показывается, а `Generate` является primary action. Upscale остаётся planned Project mode, но отложен до отдельного feature/prototype pass.

`Model Manager` и `Preset Manager` остаются важными частями приложения, но не являются primary tabs: текущий источник истины оформляет их как app-level modal overlays. Settings и queue/status UI также остаются app-level surfaces, но их точная форма определяется отдельными feature passes.

Queue Manager является app-level surface. Он открывается из верхнего app chrome/menu/command palette и показывает jobs across projects. Он не является постоянной боковой панелью Project, result history или заменой `GenerationResults` staging tray.

Загрузки моделей не получают отдельный Download Manager в MVP. Кнопка downloads в верхнем app chrome открывает Model Manager, сфокусированный на `Downloading` / install queue. Это быстрый вход в активные установки моделей, а не отдельная равноправная поверхность.

`Launchpad`, `Viewer` и постоянный Invoke-like Boards sidebar не входят в целевую навигационную модель.

## UX-язык и аудитория

ImageGen Studio проектируется не только для технически подкованных пользователей diffusion-инструментов. Значительная часть аудитории — люди, которые просто хотят генерировать и дорабатывать изображения.

Поэтому основной UI должен использовать человеческие формулировки: `Preview`, `Size`, `Open Project`, `Show in Folder`, `Generation is starting`, `Generation is unavailable`. Постоянные visible labels вроде `Worker ready`, `runtime`, `readonly`, `direct .igs files only`, `last scan` и похожие внутренние термины не должны попадать в основной интерфейс.

Технические детали допустимы в логах, диагностике, recovery dialogs и `Show details`, но не как обычная навигация или дефолтные подписи на Home/Project screens.

## Home

`Home` является обычной вкладкой в document tab strip. Её можно закрыть, но пользователь всегда может открыть её снова через Home button/menu action. Если `Home` уже открыта, Home action фокусирует существующую вкладку.

Home screen не имеет левой и правой project/canvas-панелей. Его задача — дать пользователю спокойный стартовый экран и файловую организацию проектов:

- список workspace'ов в навигационной панели;
- дефолтный workspace `Uncategorized`;
- thumbnails и basic metadata проектов;
- поиск проектов по имени, фильтрацию по состоянию и сортировку;
- cross-workspace view `Projects` с сортировкой по last opened по умолчанию;
- `New Project`;
- `Import Project`;
- `Manage Models`;
- `Manage Presets`;
- app-managed `Trash` с восстановлением и отдельным permanent-delete confirmation;
- создание, переименование и удаление регистрации workspace'ов без удаления папок и project files;
- перемещение `.igs` проектов между workspace'ами;
- preview проекта с нормальными tools для zoom/pan.

Home по умолчанию активирует `Projects`, использует `Status` как visible label для фильтра (`All statuses`, `Open`, `Recovery available`, `Needs attention`) и не показывает отдельный `Recent`: `Last opened` остаётся дефолтной сортировкой.

Preview на Home не должен показывать inactive canvas/generation controls. В нём доступны только действия просмотра и явные project actions. Постоянно видимые действия текущего прототипа: открыть, открыть в новой вкладке, переместить, показать в файловом менеджере. `Rename` и `Move to Trash` живут в card/list context menu; relink появляется только в missing-file diagnostic state.

В текущем Home-прототипе допустимы две primary-кнопки, потому что они принадлежат разным контекстам: `New Project` относится к выбранному workspace, а `Open Project` в Preview / Inspector относится к выбранному проекту. Это не должно превращаться в правило “много primary-кнопок в одной зоне”: внутри одной панели главный CTA должен оставаться один.

Workspace — плоская папка с `.igs` project files. Вложенные workspace'ы не поддерживаются. Вложенные папки и файлы не нашего формата игнорируются при сканировании. `Uncategorized` является реальной app-managed папкой и используется как физическое место назначения, если пользователь не выбрал другой workspace. Home по умолчанию открывает `Projects`. `Projects`, конкретный workspace и `Trash` являются взаимоисключающими browse selections; `Projects` и `Trash` не являются workspace'ами.

Нормальный autosave не показывается как Home status. Только валидное незавершённое состояние после неожиданного завершения работы отображается как `Recovery available` и разрешается через recovery flow.

Детальная спецификация Home screen: `docs/features/home-screen.md`.

## Project Tabs

`Project` tab сфокусирована на одном открытом `.igs` project. В ней находятся:

- interactive Konva-based canvas;
- layer stack;
- Smart Patch Layer controls;
- generation settings;
- model/LoRA/VAE controls;
- project resource warnings;
- generation provenance attached to accepted layers/variants and derived accepted-result history;
- save/dirty/recovery status.

Current Project scope contains domain mode `generate`: generation and local editing through canvas, layers, Smart Patch Layer, masks and model settings, with no separate `Create` label.

Upscale is deferred. Its future domain slot may remain reserved, but current Project navigation, prototype and acceptance criteria must not depend on a working `Upscale` mode.

Детальная спецификация содержимого `Generate` mode: `docs/features/project/generate-mode/README.md`.

If/when Upscale is designed, a mode switch may appear in the left settings panel, visually distinct from the document tab strip. Until then, Project renders neither a one-option segmented switch nor a redundant `Create` header.

Project tab не показывает отдельную строку с названием файла и статусом сохранения над рабочей областью. Название проекта, dirty marker и базовый статус документа принадлежат document tab/app chrome, чтобы не дублировать информацию.

`Canvas` remains the central unbounded Project composition space. A separate movable/resizable primary generation bbox defines the finite normal-generation target and can extend beyond existing image content. The selected Smart Patch Layer uses its own layer-owned bbox.

Project does not expose txt2img/img2img/inpaint/outpaint as user-selected modes. At enqueue time the runtime derives the path from visible raster/mask content inside the frozen target area. Denoising Strength remains visible but disabled with a reason when the current target has no applicable raster input.

### Canvas side controls

В `Project` / `Generate` всегда видимы только базовые side controls:

- collapse left panel;
- `Pan Tool`;
- primary `Bounding Box` for the normal-generation target;
- collapse right panel;

`Pan Tool` является navigation/inspection tool, а не отдельным `Viewer` mode.

Primary `Bounding Box` перемещает и изменяет область генерации, не обрезая Raster Layer и не расширяя Project Canvas: у бесконечной рабочей поверхности нет фиксированной границы. При выбранном Smart Patch его контекстный `Bounding Box` редактирует только layer-owned bbox.

Contextual canvas tool rails появляются только для выбранных layer types:

- Smart Patch Layer: `Transform Mask`, Lasso, Polygon Lasso, Brush, Eraser, Bounding Box, `Fit Patch BBox to Mask`;
- Regional Guidance Layer: `Transform Region`, Lasso, Polygon Lasso, Brush, Eraser.

Raster Layer canvas editing в MVP не поддерживается. Для Raster Layer не показываются transform/crop/paint/filter tools.

`Fit Patch BBox to Mask` показывается только для Smart Patch Layer в его контекстном тулбаре. Для Regional Guidance Layer такая кнопка не показывается, потому что у Regional Guidance нет собственного generation bbox.

Canvas viewport controls живут в нижней compact bar у canvas: zoom, `Fit View` и contextual interaction hints. В Project секции `Generation area` общие controls размера (width/height, aspect) меняют primary generation bbox; валидное вручную введённое число применяется по `Enter`, без отдельной кнопки `Apply`, а меняющий размеры preset соотношения и swap применяются сразу. Превью находится над полями на всю ширину узкой панели, lock — рядом с aspect ratio, swap — между width/height. Компактная иконка `Fit to active layer` в заголовке подгоняет bbox только к выбранному видимому Raster Layer с ненулевой opacity и недоступна без него. Числовых x/y в этой секции нет: при выбранном Bounding Box tool и фокусе на canvas стрелки перемещают bbox на 1 px, Shift+стрелки — на 10 px. Перемещение и изменение размера также доступны на canvas через drag/handles. `Fit View` меняет только viewport. Ни одно из этих действий не задаёт export bounds автоматически.

Active bbox size/readout и будущий `...` canvas context menu позиционируются как overlays самой `canvas-area`: readout сверху слева, menu сверху справа. Они не должны перекрывать изображение. Текущий label `Project Canvas W × H` принадлежит конечному прототипу и должен быть заменён при реализации бесконечного canvas.

Generate action area находится фиксированно сверху левой settings panel, над прокручиваемыми настройками. В ней находятся кнопка `Generate`, селектор количества изображений за одно нажатие, queue action и отдельная кнопка отмены текущей генерации.

Project footer does not expose `Pause Queue` or `Resume Queue` in the current scope.

Completed outputs appear in a collapsible bottom `GenerationResults` staging tray. One candidate is focused for canvas preview; a separate checkbox selection can contain one or more completed candidates. Normal acceptance adds independent Raster Layers, Smart Patch acceptance adds variants, and generation completion alone does not mutate `.igs`.

Normal candidate preview and accepted Raster Layer use the bbox coordinates frozen with the job. `Add N as Layers` can place a result outside all earlier image content without growing a document frame. The current Vue prototype still has a finite `Project Canvas` frame, `Crop / Resize Project Canvas` rail control and Size mutation of that frame; these are gaps, not the accepted infinite-canvas behavior.

### Upscale follow-up

Upscale UX is intentionally deferred from the current Project prototype pass.

The previously agreed future direction remains:

Команда:

- берёт flattened composite видимых слоёв текущего Project;
- создаёт immutable upscale input asset внутри `.igs`;
- сохраняет metadata источника: source layer stack hash, finite source composite rect/dimensions, source revision/timestamp, visible layers metadata;
- switches Project into a future `Upscale` mode;
- делает новый input активным для upscale job.

В режиме `Upscale` должна быть команда `Use Current Composite` / `Refresh Composite`, которая выполняет тот же handoff из текущего состояния Generate. Если слои или настройки композита изменились после предыдущего handoff, Upscale показывает состояние `Source is outdated` и предлагает refresh.

Future Upscale result should support at minimum:

- `Add as New Layer`;
- `Export`.

`Replace Source` remains rejected for the first Upscale pass because it creates a destructive workflow.

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

Один и тот же `.igs` категорически запрещено открывать в нескольких вкладках. Если пользователь пытается открыть уже открытый project file, приложение фокусирует существующую `Project` tab. Это правило действует для открытия из `Home`, file picker, deep link, menu action и любых других entry points.

Boards/gallery не показываются как постоянная боковая панель Project. Управление проектами находится на `Home`, чтобы Project tab не конкурировала за внимание с файловой организацией.

### Opening behavior

Выбор и открытие проекта из `Home` используют list-detail semantics с browser-like modifier behavior:

- single left click по `.igs` project card выбирает проект и обновляет Inspector, не открывая `Project` tab;
- double click или `Enter` открывает выбранный проект в текущей вкладке. Если текущая вкладка — `Home`, она заменяется на `Project` tab;
- middle click / Ctrl+click открывает проект в новой вкладке рядом с `Home`.
- right click показывает меню `Open`, `Open in New Tab`, `Rename`, `Move to Workspace`, `Show in Folder`, `Move to Trash`.
- если проект уже открыт, любое действие открытия фокусирует существующую `Project` tab вместо создания дубликата.

## Навигация

Для desktop creative tool лучше подходит спокойная рабочая оболочка:

- верхнее меню/app bar для глобальных действий: File, Edit, Project, Models, Window, Help;
- document tab strip: `Home`, затем открытые `Project` tabs;
- Home button/action, который фокусирует или заново открывает `Home`;
- compact queue/download activity buttons в верхнем app chrome;
- центральная рабочая область;
- правая панель параметров для выбранного объекта внутри Project;
- `Saved generations` в app chrome открывает отдельную общую модалку из Home и Project;
- Project Layers toolbar сохраняет отдельный current-document список принятых результатов;
- provenance/settings comparison остаётся contextual действием слоя.

Activity buttons в app chrome разделены по ownership:

- generation/upscale queue button открывает app-level Queue Manager;
- downloads button открывает Model Manager на установках/загрузках моделей;
- settings button открывает глобальные настройки приложения.

Это production ownership. В текущем Vue playground Home logo/document tabs и Home manager actions интерактивны, а app menu, queue/download/settings icons и drawn window controls остаются presentational.

Когда app-level overlay открыт, document tab strip и рабочая область под ним визуально уходят в фон: dim/blur + pointer-events disabled. Верхнее меню и native window controls могут оставаться читаемыми как часть оболочки приложения, но вкладки не должны выглядеть доступными для прямой навигации за модальным слоем.

Model Manager и Preset Manager используют native Naive modal lifecycle: restrained enter/leave transition, explicit close и `Esc`. Dirty Preset Manager перехватывает закрытие своим save/discard guard; вложенный dialog получает `Esc` раньше родительского manager. Home остаётся смонтированным под overlay и восстанавливает browse state после закрытия.

Prototype layer ordering централизован в `theme/app-layers.ts`, а не распределён по component-local magic numbers: content `0`, sticky chrome `10`, floating controls `100`, app overlay `1000`, nested dialog `2000`, popover `3000`, notification `4000`. Production theme может изменить значения, но должна сохранить один именованный registry и тот же ownership order.

Home и обе manager-поверхности используют bounded mouse-resizable split panels. Home позволяет менять ширину Workspace Sidebar и Inspector; Model Manager — Left Navigation и Details; Preset Manager — workflow navigation и editor. Collapsed Inspector временно отключает свой resize handle.

### App chrome

В MVP используем custom Electron titlebar/chrome по T3Code-like схеме:

- системный titlebar скрыт через Electron `titleBarStyle`;
- нативные кнопки окна остаются через `titleBarOverlay`;
- app menu row и document tab strip являются частью draggable titlebar region;
- интерактивные элементы верхней панели помечаются как no-drag regions;
- справа резервируется зона под native window controls через Window Controls Overlay geometry.

HTML-прототип может рисовать статичные кнопки окна справа, чтобы показать композицию chrome. В реальном Electron-приложении это место занимает native `titleBarOverlay`.

Горизонтальный логотип находится в menu row. Высота menu row — около 40px, чтобы логотип оставался читаемым без перегруза верхнего chrome.

Project tab marker использует цвет workspace. Цвет workspace выбирается из компактной palette при создании и может меняться вручную; текущий prototype default — teal. `Home` tab использует home icon вместо workspace color marker.

## MVP-состояния, которые нужно спроектировать заранее

- Generation engine unavailable / starting / busy / failed.
- No model installed.
- CivitAI token missing.
- Download in progress.
- Generation in progress.
- Generation failed.
- Missing output file in history.
- Missing/corrupt `.igs` project.
- Recovery available after an interrupted autosave session.
- Workspace path missing or inaccessible.
- Preset resource missing.
- Base model family warning.
- Smart Patch Layer outdated.

## UX-правило для provenance и presets

Контекстное меню Raster Layer и Smart Patch Layer использует одинаковое действие
`Compare generation settings`. Оно открывает bounded read-only popover
`Generated with` / `Current Canvas`; в popover нет Apply/Recall/Restore actions.

`Save preset from image` остаётся отдельным context action и создаёт новый
редактируемый template. Comparison не создаёт preset и не изменяет current
generation state.

Обе операции работают только с переносимыми generation settings. Smart Patch
mask, Bounding Box, internal resolution, compositing state и source revisions не
показываются в settings diff и не копируются в preset. Для переиспользования
этого layer-owned состояния пользователь применяет `Duplicate Layer`.

## UX-правило для Smart Patch

Mask, primary generation bbox dimensions и Smart Patch Bounding Box должны иметь понятный контекст владения. Пользователь не должен гадать, что именно он изменяет: нормальную область генерации, область выбранного Smart Patch или форму его маски. Бесконечный Project Canvas не имеет параметра `Canvas Size`.

Smart Patch Layer описан как отдельная feature-сущность в `docs/features/project/generate-mode/smart-patch-layer.md`. Этот документ является рабочим источником правил ownership для layer-owned mask, layer-owned bounding box, internal resolution и raster sub-layers.

Для выбранного Smart Patch Layer точное редактирование bounding box оформляется как компактная кнопка/бейдж `Bounding Box` в selected-layer controls. Кнопка открывает popover с x/y/width/height, internal resolution, aspect lock, fit-to-mask, fit-to-primary-bbox и scale-before-processing. Прямое редактирование bbox handles на canvas остаётся основным способом работы, popover нужен для точных значений.

Основная видимая команда `Fit Patch BBox to Mask` находится в контекстном тулбаре Smart Patch Layer. В bbox popover она может дублироваться как precision/action command, но не является глобальной командой canvas toolbar.
