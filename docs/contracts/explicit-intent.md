# PP-002: Явное намерение вместо магического control — Supporting Contract

Нормативные правила для [PP-002: Явное намерение вместо магического control](../product-promises.md#pp-002-явное-намерение-вместо-магического-control).
Краткое обещание и его публичный статус находятся в реестре; этот документ
сохраняет UX-решения, границы, исключения и проверяемые инварианты.

**Область:** inputs, search, creation/import/install flows, selectors, dialogs и
другие интерактивные controls.

## Пользовательская выгода

Пользователю не нужно:

- выяснять опытным путём, ищет поле или создаёт новую сущность;
- помнить, какие URL, paths, identifiers и search queries принимает один input;
- гадать, изменится ли смысл `Enter` при отсутствии результатов;
- разбираться, почему один и тот же control выполняет разные операции на разных
  экранах;
- бояться случайной mutation во время поиска или навигации.

Label, placeholder, surrounding context и доступное primary action заранее
объясняют результат взаимодействия.

## Явное не-обещание

ImageGen Studio не предоставляет магические polymorphic inputs, которые в
зависимости от содержимого могут:

- искать существующие сущности;
- создавать новые сущности;
- импортировать локальный файл;
- сканировать папку;
- устанавливать ресурс по URL;
- искать ресурс во внешнем каталоге.

Read-only narrowing и domain mutation не объединяются в неявный flow. Search
input не становится `Create`, `Import`, `Install` или `Scan` только потому, что
точного результата не найдено или введённая строка похожа на другой source type.

## Один primary intent

Один control может выполнять несколько технических действий, если они
обслуживают одно пользовательское намерение и не меняют ожидаемый результат:

- prompt editor редактирует текст и показывает autocomplete;
- search сопоставляет query с именем, tags и metadata;
- file import определяет формат уже выбранного файла;
- folder picker выбирает folder, а отдельное `Scan` явно запускает сканирование;
- `Install` загружает и проверяет зависимости выбранной модели;
- selector фильтрует варианты и применяет явно выбранный вариант.

Разница является продуктовой, а не технической:

> Допустима техническая сложность внутри одного намерения. Недопустима скрытая
> смена самого намерения.

Если несколько source types приводят к существенно разным validation,
permissions, progress, error или recovery flows, пользователь сначала явно
выбирает flow. Общий backend parser не является основанием объединять их в один
visible input.

## Обязательные глаголы

Mutation должна называться самостоятельным глаголом:

- `Create`;
- `Import`;
- `Install`;
- `Scan`;
- `Apply`;
- `Remove`;
- `Delete`.

Search, filter и select остаются операциями поиска или выбора. Они не получают
скрытый destructive или creative side effect.

Например, Model Manager использует отдельные flows:

- `Search models` фильтрует установленный catalog;
- `Add from CivitAI URL` открывает import flow по URL;
- будущий `Import local file` выбирает конкретный file;
- будущий `Scan folder` выбирает folder и явно запускает scan;
- будущий marketplace search, если будет принят, является отдельным catalog
  surface.

## Проверяемые инварианты

Обещание считается соблюдённым, если:

- placeholder называет один пользовательский intent;
- search input не создаёт, не импортирует и не устанавливает сущность;
- mutation имеет отдельный видимый verb и accessible name;
- пользователь до submit знает тип операции и её основные последствия;
- `Enter` в search не превращается в creation при пустой выдаче;
- control не меняет назначение из-за соседней panel или случайного текущего
  selection;
- разные source types с разными lifecycle получают отдельный явный выбор;
- Playwright tests отдельно проверяют search и каждую mutation, а не один
  universal happy path.

## Допустимые исключения

Creatable selector допустим только для узкой доменной сущности, где создание
является ожидаемой частью самого выбора, создаваемый объект безопасен, а UI явно
показывает отдельный вариант `Create ...`. Само наличие такого паттерна в UI
library не является причиной использовать его.

Command palette также может находить и запускать разные команды, потому что его
явный intent — выбрать command. Он не заменяет domain-specific create/import
flows и не скрывает последствия выбранной команды.

## Evidence и текущие границы

[Home tests](../prototype-app/tests/home.spec.ts) и
[Preset tests](../prototype-app/tests/preset-manager.spec.ts) содержат раздельные
search/create/apply сценарии. [Model Manager](../features/model-manager.md#vue-prototype-coverage)
показывает отдельный URL install flow; production Electron flow устанавливает
ресурс после явного подтверждения, а prototype version lifecycle остаётся mock.
Публичный статус требует проверки всех доступных production
entry points, включая клавиатурные действия, пустую выдачу и ошибки.
