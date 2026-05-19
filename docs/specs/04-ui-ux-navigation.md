# UI / UX Navigation

## Основные зоны приложения

MVP можно собрать вокруг пяти рабочих зон:

- Generate — форма генерации, выбранная модель, LoRA stack, параметры и кнопка запуска.
- History — последние генерации, detail view, snapshot, действия apply/save preset.
- Model Library — установленные модели, импорт с CivitAI, статус скачивания.
- Presets — каталог, редактор, full/partial apply.
- Canvas — project canvas, layer stack, Smart Patch Layer, mask/bounding box controls.

## Навигация

Для desktop creative tool лучше подходит спокойная рабочая оболочка:

- левая навигация между рабочими зонами;
- верхняя строка для статуса worker'а, текущей модели и глобальных действий;
- центральная рабочая область;
- правая панель параметров для выбранного объекта;
- нижняя или боковая история там, где она нужна генерации.

## MVP-состояния, которые нужно спроектировать заранее

- Worker unavailable / starting / ready / busy / failed.
- No model installed.
- CivitAI token missing.
- Download in progress.
- Generation in progress.
- Generation failed.
- Missing output file in history.
- Preset resource missing.
- Base model family warning.
- Smart Patch Layer outdated.

## UX-правило для пресетов

Действия `Apply settings from image` и `Save preset from image` должны быть визуально и текстово различимы. Первое меняет текущую форму генерации, второе создаёт новый редактируемый шаблон.

## UX-правило для Smart Patch

Mask, Bounding Box и Canvas Size должны быть разными секциями интерфейса. Пользователь не должен гадать, что именно он сейчас изменяет: размер всего проекта, область генерации или форму маски.
