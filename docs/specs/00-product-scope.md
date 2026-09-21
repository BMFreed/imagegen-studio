# Product Scope

## Что уже зафиксировано

ImageGen Studio — локальное desktop-приложение для генерации изображений, вдохновлённое InvokeAI / Forge, но с главным фокусом на управлении моделями, пресетами, provenance принятых результатов и воспроизводимостью настроек.

InvokeAI является основным reference product. Проектная позиция: не изобретать заново уже рабочие паттерны, а брать проверенные подходы InvokeAI и адаптировать их под логику ImageGen Studio. NIH недопустим: своё решение пишется только тогда, когда подход InvokeAI не подходит под выбранный стек, бизнес-логику, UX или архитектурные границы проекта, и нет более подходящего зрелого ready-made механизма.

Целевая аудитория ImageGen Studio — не только технически подкованные пользователи diffusion-инструментов. В продукте нужно исходить из того, что значительная часть пользователей — обычные люди, которые хотят генерировать и дорабатывать картинки, а не разбираться в worker'ах, runtime-состояниях, внутренних форматах и ML-терминах.

Пользовательский интерфейс должен говорить языком творческой задачи: проект, изображение, модель, размер, слои, генерация, апскейл, предпросмотр, сохранение. Технические детали допустимы в диагностике, логах и `Show details`, но не как постоянные visible labels в основном UI.

Глобальная цель проекта — взять то, что хорошо работает в InvokeAI, перенести это в более удобный для ImageGen Studio стек и прокачать UX. Изобретательство допустимо прежде всего в продуктовой форме, UX и workflows. В работе с моделями, очередями, worker protocol, canvas lifecycle и другими сложными механизмами проект опирается на InvokeAI или другие готовые решения, если механизм InvokeAI нас не устраивает.

Reference-first подход не означает перенос всей информационной архитектуры reference product. ImageGen Studio сознательно обещает понятный, product-owned интерфейс вместо собираемого workbench: пользователь настраивает генерацию и творческую работу, но не проектирует раскладку приложения. Продукт не является IDE или dockable panel system. Полный контракт, negative scope и проверяемые инварианты зафиксированы в [Product Promises](../product-promises.md#pp-001-понятный-интерфейс-вместо-собираемого-workbench).

Та же продуктовая рамка требует [одного явного intent на control](../product-promises.md#pp-002-явное-намерение-вместо-магического-control), [одного canonical owner для каждой сущности и настройки](../product-promises.md#pp-003-одна-сущность-один-владелец-и-одно-каноническое-место), [managed model library с безопасным version lifecycle](../product-promises.md#pp-004-управляемая-библиотека-моделей-вместо-ручной-работы-с-файлами), [immutable provenance каждого принятого результата](../product-promises.md#pp-005-каждый-принятый-результат-помнит-как-он-был-создан) и [переиспользуемых presets с предупреждением о недоступных ресурсах до применения](../product-promises.md#pp-006-настройки-генерации-можно-сохранять-и-переиспользовать). Search, create, import и install не маскируются одним polymorphic input; Projects, Models, Presets, temporary candidates, accepted Layers и provenance не подменяют друг друга.

Для SDXL/Illustrious-like checkpoint'ов MVP также следует InvokeAI-пути: `.safetensors` хранится как исходный пользовательский файл, worker грузит его через Diffusers single-file loading, а кэширование происходит на уровне уже загруженных моделей в RAM/VRAM. Скрытая постоянная конвертация в diffusers-директорию не входит в базовое поведение.

MVP должен доказать ценность не как “ещё одной формы Generate”, а как студии, где пользователь может:

- импортировать модель с CivitAI по ссылке;
- хранить локальную библиотеку моделей и metadata;
- обнаруживать новую CivitAI-версию, устанавливать её рядом со старой и явно
  выбирать default version без изменения existing references;
- видеть свои проекты через `Home` screen с workspace'ами, `Projects`, app-managed `Trash`, search/Status filtering и preview;
- создавать `.igs`, импортировать внешний `.igs` через Move/Copy в managed workspace и открывать project files;
- открывать несколько `.igs` проектов одновременно, каждый в своей `Project` tab;
- генерировать изображения через локальный Python worker внутри `Project`;
- просматривать несколько временных generation candidates и принимать один или несколько;
- видеть историю только принятых generated results;
- открывать immutable provenance принятого результата;
- открывать одинаковое read-only сравнение из контекстного меню Raster или Smart
  Patch Layer: generated provenance против current Canvas state без mutation;
- создавать пресеты вручную и из старых генераций;
- применять пресеты полностью или по секциям;
- получать понятные ошибки по отсутствующим моделям/LoRA.

Основная продуктовая оболочка строится как document-based editor:

- `Home` tab — стартовый экран: Workspaces, cross-workspace `Projects`, app-managed `Trash`, new/import project, доступ к Model Manager и Preset Manager;
- `Project` tab — открытый `.igs` документ: canvas, Create/generate workflow, staging candidates, слои, маски, настройки модели, accepted-result provenance, save/dirty/recovery status.

Document tabs не являются layout presets. Название Home, Project или domain mode задаёт стабильное назначение поверхности и не может быть переопределено произвольной заменой primary panels.

Model Manager и Preset Manager являются app-level modal overlays, а не document tabs. Apply Preset остаётся Project-scoped modal flow: он редактирует временную application-копию и не изменяет сохранённый preset.

`Canvas` — не отдельная вкладка приложения, а сущность внутри `Project` tab.

Current Project scope uses domain mode `generate` with visible label `Create`. Txt2img/img2img/inpaint/outpaint is derived automatically from target-area canvas content. Upscale remains a planned follow-up and does not block the current Project prototype or first implementation slice.

Один и тот же `.igs` нельзя открыть дважды. Повторное открытие уже открытого project file фокусирует существующую `Project` tab.

Отдельная top-level вкладка `Generate`, режимы `Launchpad`/`Viewer` и постоянный mini-gallery/boards sidebar не входят в целевую UX-модель ImageGen Studio. Быстрая генерация с нуля реализуется как создание нового `.igs` проекта и работа с ним в `Project` / `Create`.

[PP-007](../product-promises.md#pp-007-проект-принадлежит-пользователю) закрепляет
переносимый пользовательский `.igs`, явную сохранённую версию и recovery dirty
работы. [PP-008](../product-promises.md#pp-008-генерация-меняет-проект-только-по-явному-решению)
закрепляет просмотр candidates и явное undoable принятие результатов.
Подробности находятся в [document lifecycle](../features/project/document-lifecycle.md)
и [staging contract](../features/project/generate-mode/generation-results.md).
Оба обещания обязательны для MVP; production persistence и worker flow пока
не доказаны прототипом. Полная карта покрытия находится в реестре обещаний.

## Продуктовые нецели MVP

В MVP не нужно строить plugin API, workflow graph уровня ComfyUI, сложную систему наследования пресетов, полноценный browser CivitAI или wildcard expansion для prompt'ов. Эти направления важны, но они не должны задерживать первый рабочий вертикальный срез. Wildcards сейчас не являются продуктовой целью ImageGen Studio.

## Северная звезда MVP

Пользователь может вернуться к удачной генерации, понять, чем она была сделана, превратить её в пресет и аккуратно применить эти настройки к новому эксперименту.
