# PP-003: Одна сущность, один владелец и одно каноническое место — Supporting Contract

Нормативные правила для [PP-003: Одна сущность, один владелец и одно каноническое место](../product-promises.md#pp-003-одна-сущность-один-владелец-и-одно-каноническое-место).
Краткое обещание и его публичный статус находятся в реестре; этот документ
сохраняет UX-решения, границы, исключения и проверяемые инварианты.

**Область:** domain vocabulary, information architecture, ownership, navigation,
resource managers, Project state и placement настроек.

## Пользовательская выгода

Пользователю не нужно выбирать между несколькими похожими containers, чтобы
найти результат, проект или ресурс. Понятия приложения образуют устойчивую
ментальную модель, а повторное использование сущности не создаёт нового места её
владения.

Если две top-level сущности отвечают на один и тот же вопрос — например, «где
моя картинка?» или «где состояние моей работы?» — их граница недостаточно
определена. Их нужно объединить либо дать им разные, явно наблюдаемые lifecycle
и пользовательские роли.

## Явное не-обещание

ImageGen Studio не создаёт несколько равноправных и частично пересекающихся
способов организации одной и той же работы.

Продукт не обещает Invoke-like параллельную иерархию из `Projects`, `Boards`,
`Gallery`, `Media`, `Assets` и `Canvas states`, если новый пользователь не может
однозначно объяснить различие между ними.

Также не допускаются:

- несколько independently stateful manager surfaces для одной сущности;
- полный CRUD одной сущности в нескольких несогласованных местах;
- разные visible names для одного artifact без ясного преобразования;
- placement настройки по близости реализации вместо domain ownership;
- top-level пользовательская сущность только потому, что такой type существует
  в storage или API;
- contextual копия surface, которая незаметно становится вторым владельцем.

## Канонический словарь

Базовые сущности ImageGen Studio имеют следующие роли:

- **Project** — переносимый `.igs` document с Canvas, Layers, editable state и
  историей принятой работы;
- **Workspace** — файловое место хранения Projects;
- **Projects** — cross-workspace view, а не отдельный container или Workspace;
- **Trash** — lifecycle view для удалённых Projects, а не отдельное место их
  обычного хранения;
- **Canvas** — Project-owned рабочая поверхность и текущая композиция, а не
  библиотека результатов;
- **Model** — установленный reusable inference resource, которым владеет Model
  Manager;
- **Preset** — reusable набор generation settings, которым владеет Preset
  Manager;
- **Generation candidate** — временный результат текущего запуска, ещё не
  являющийся частью Project;
- **Raster Layer / raster variant** — результат, который пользователь явно
  принял в состояние Project;
- **Accepted-result history** — derived Project-owned index принятых
  Layers/variants и их provenance, а не второй container для изображений;
- **Provenance** — immutable объяснение того, как конкретный принятый результат
  был получен;
- **Queue item** — frozen выполняемая, ожидающая или завершённая generation job.

`Asset` может существовать как internal storage term, ID или implementation
entity. Это не делает его автоматически полезной top-level пользовательской
категорией. То же правило применяется к `media`, `blob`, `record`, `node` и
другим backend nouns.

## Настройки имеют владельцев

Canonical ownership относится не только к сущностям, но и к параметрам.
Настройка располагается рядом с тем, на что она влияет, а не рядом с компонентом,
через который реализации удобно получить к ней доступ.

Примеры:

- Denoising Strength принадлежит generation/img2img settings, а не Layers;
- layer opacity принадлежит конкретному Raster Layer;
- mask blur принадлежит Mask;
- Bounding Box принадлежит Smart Patch Layer;
- model defaults принадлежат Model Manager;
- текущие generation overrides принадлежат Project generation draft.

Context может временно показать shortcut или summary настройки, но не меняет её
owner и canonical edit surface.

## Много entry points, один owner

Одно каноническое место не означает единственный entry point.

Model Manager можно открыть из Home, app menu, Model selector или
missing-resource diagnostic. Все пути фокусируют одну manager surface и одну
модель состояния; они не создают несколько независимых Model Managers.

Contextual image picker может выбирать изображение для конкретной операции, но
не становится ещё одной полноценной Gallery со своими независимыми selection,
filters и lifecycle.

Короткое правило:

> Много shortcuts к одному владельцу — нормально. Много конкурирующих
> владельцев одной сущности — нет.

Read-only projection также допустима: например, Home `Projects` объединяет
projects из разных Workspaces, но явно остаётся view и не становится новым
местом хранения.

## Проверка новой сущности

Перед добавлением нового visible noun нужно ответить:

1. Какую единственную пользовательскую проблему решает сущность?
2. Кто её владелец и где её canonical management surface?
3. Как она создаётся, сохраняется, перемещается и удаляется?
4. Чем её lifecycle отличается от уже существующей сущности?
5. Может ли пользователь найти тот же artifact под другим top-level noun?
6. Является ли новая сущность продуктовой необходимостью или отражением
   backend/storage architecture?

Если отличие нельзя объяснить одним предложением без `или`, новая сущность не
готова к включению в пользовательскую модель.

## Проверяемые инварианты

Обещание считается соблюдённым, если:

- каждая top-level сущность имеет документированные owner и lifecycle;
- у сущности есть одна canonical management surface;
- альтернативные entry points открывают или фокусируют владельца, а не создают
  independently stateful копию;
- один artifact не получает несколько равноправных пользовательских названий;
- полный CRUD не дублируется в несогласованных местах;
- setting находится в domain section своего владельца;
- deletion semantics однозначны и документированы;
- internal storage nouns не становятся visible navigation без product review;
- тесты entry points проверяют переход к одному canonical state;
- новая сущность проходит ownership/lifecycle questions до реализации UI.

## Допустимые исключения

Contextual picker, read-only projection, summary или deep link допустимы, если
они явно ограничены текущей задачей, не создают отдельный lifecycle и ведут к
каноническому владельцу для полного управления.

Если future global media library действительно получит отдельную
пользовательскую ценность, ownership и отношение к Project/Layers должны быть
сначала зафиксированы пересмотром этого promise. Нельзя ввести её постепенно как
безымянную вторую Gallery.

## Evidence и текущие границы

[Home](../features/home-screen.md), [Model Manager](../features/model-manager.md),
[Presets](../features/presets.md) и [Queue Manager](../features/queue-manager.md)
уточняют конкретных владельцев и contextual entry points.
Прототип подтверждает часть UI-переходов в
[Home](../prototype-app/tests/home.spec.ts),
[Project](../prototype-app/tests/project.spec.ts) и
[Preset tests](../prototype-app/tests/preset-manager.spec.ts).
Production resource handoff, global queue и accepted-result history ещё не
доказываются этими mocks. Любой новый entry point должен вести к тому же owner.

