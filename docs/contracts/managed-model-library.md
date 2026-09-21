# PP-004: Управляемая библиотека моделей вместо ручной работы с файлами — Supporting Contract

Нормативные правила для [PP-004: Управляемая библиотека моделей вместо ручной работы с файлами](../product-promises.md#pp-004-управляемая-библиотека-моделей-вместо-ручной-работы-с-файлами).
Краткое обещание и его публичный статус находятся в реестре; этот документ
сохраняет UX-решения, границы, исключения и проверяемые инварианты.

**Область:** Model Manager, установка моделей, source metadata, версии,
обновления, repair и использование reusable generation resources в Projects,
Presets и accepted-result provenance.

## Пользовательская выгода

Для обычной установки модели пользователю не нужно:

- отдельно скачивать файл в браузере;
- определять, какой файл соответствует нужной CivitAI-версии;
- вручную копировать файл в правильную папку;
- придумывать локальную структуру каталогов и имена файлов;
- отдельно искать preview, trigger words и compatibility metadata;
- запоминать, какая точная версия использовалась в Project или Preset;
- вручную искать замену отсутствующему или повреждённому файлу;
- опасаться, что обновление незаметно изменит существующий Project.

Model Manager показывает библиотеку в пользовательских понятиях: название,
автор, тип ресурса, версия, совместимость, trigger words или activation tokens,
состояние локального файла, использование и доступность обновления.

## Managed lifecycle

MVP использует CivitAI URL как первый поддерживаемый installation source:

1. Пользователь открывает отдельный `Add from CivitAI URL` flow.
2. Приложение получает metadata и показывает import preview до скачивания.
3. Пользователь явно подтверждает установку конкретной версии и файла.
4. Download становится наблюдаемым Model Manager job с progress и error state.
5. Файл скачивается во временный path, проверяется и только затем перемещается в
   managed models directory и регистрируется в SQLite.
6. Установленный ресурс становится доступен во всех selectors через единую
   библиотеку Model Manager.

Установка не начинается скрытно после вставки URL. Search установленной
библиотеки также не превращается в install flow.

## Source metadata и пользовательские настройки

Source metadata загружается из CivitAI и остаётся source-owned информацией. В неё
входят доступные источнику имя, автор, resource type, версия, base model family,
prediction type, описание, preview, trigger words или activation tokens, file
identity, размер, hash и source link.

Пользователь может управлять эксплуатационным поведением ресурса:

- выбирать установленную версию для Project;
- задавать default version для новых selections;
- задавать поддерживаемые generation defaults;
- устанавливать, восстанавливать и удалять версии.

Эти действия не редактируют source metadata. Metadata, скопированная в immutable
accepted-result provenance, не изменяется при refresh, rename, update или remove
ресурса в текущей библиотеке.

## Версионирование и обновления

Версионирование моделей входит в MVP.

- одна CivitAI model identity объединяет доступные и установленные версии;
- каждая точная версия и file hash остаются отдельной resource identity;
- Model Manager обнаруживает доступную более новую версию и показывает update
  state без автоматической установки;
- `Install Version` сначала показывает version/file preview и затем устанавливает
  новую версию рядом со старой;
- несколько версий одной модели могут быть установлены одновременно;
- пользователь явно выбирает `Default` для новых model selections;
- Generate позволяет явно выбрать любую установленную версию;
- изменение default version не переписывает существующие Projects, Presets или
  provenance;
- старую установленную версию можно снова выбрать без восстановления backup;
- удаление версии является отдельным подтверждаемым действием.

Способ и расписание проверки CivitAI на новые версии могут меняться, но
применение обновления всегда требует явного пользовательского действия.

## Целостность и repair

Продукт отвечает не только за успешный download, но и за состояние managed
resource:

- exact duplicate определяется по CivitAI version identity и/или file hash и не
  скачивается повторно по умолчанию;
- файл считается установленным только после доступных size/hash checks;
- missing или corrupted resource получает явный diagnostic;
- известную CivitAI-версию можно восстановить повторной загрузкой именно этого
  файла;
- presets и provenance остаются читаемыми после удаления локального файла;
- наличие другой версии той же модели не маскирует exact-version mismatch.

## Явное не-обещание

ImageGen Studio — не файловый менеджер моделей, не редактор каталожных карточек и
не универсальный model marketplace. Продукт не обещает:

- основной workflow из ручного скачивания и копирования файлов;
- установку произвольного файла только по расширению `.safetensors`;
- один polymorphic input для CivitAI URL, local path, Hugging Face repo и search;
- сохранение пользовательской структуры папок как организации библиотеки;
- полноценный встроенный CivitAI browser, feed или recommendation system;
- поддержку любого файла или любой модели, опубликованной на CivitAI;
- обход авторизации, лицензии или ограничений доступа источника;
- silent auto-update или автоматическую установку всех новых версий;
- перезапись установленной версии новой и автоматическое удаление старых версий;
- ручное редактирование source metadata;
- смену source avatar/preview, автора, описания, compatibility metadata или
  trigger words;
- превращение model card в настраиваемый профиль;
- скрытую destructive conversion исходного `.safetensors`;
- хранение reusable model weights внутри каждого `.igs`;
- model training как часть Model Manager.

Local file import и folder scan могут появиться как отдельные явные flows, но не
превращают Model Manager в browser произвольной файловой системы.

## Проверяемые инварианты

Обещание считается соблюдённым, если:

- CivitAI URL обрабатывается отдельным preview-first install flow;
- пользователь видит модель, точную версию, файл и размер до download;
- install job имеет наблюдаемые progress, status, cancel/retry и error;
- модель регистрируется только после проверки файла;
- exact duplicate не скачивается повторно без явного действия;
- несколько версий одной модели могут существовать одновременно;
- доступная новая версия видима, но не устанавливается автоматически;
- установка обновления не удаляет и не перезаписывает старую версию;
- default version влияет только на новые selections;
- существующие Projects, Presets и provenance сохраняют exact version identity;
- missing или corrupted version можно диагностировать и восстановить;
- model selectors получают ресурсы из одной библиотеки Model Manager;
- model card показывает source metadata, но не редактирует её.

## Текущий статус прототипа

Vue-прототип уже показывает `Installed Versions`, `Install Version`, `Default`,
`Set Default`, import preview и компактный install progress. Эти элементы пока
presentation-only: прототип не обнаруживает обновления, не устанавливает новую
версию, не меняет default version и не моделирует сохранение exact references.

Интерактивный version/update lifecycle является первым приоритетом при следующем
расширении Model Manager prototype. До появления реализованного flow и тестов
PP-004 ограничивает product decisions, но не выдаётся за уже готовую возможность.

## Связанные contracts и evidence

[Model Manager](../features/model-manager.md) определяет installation UI,
ошибки и [prototype gaps](../features/model-manager.md#vue-prototype-coverage);
[Data Storage](../specs/03-data-storage.md) — persistent resource identity.
[model-manager.spec.ts](../prototype-app/tests/model-manager.spec.ts) проверяет
текущие prototype surfaces, но не доказывает download, repair или version update.
Успешное восстановление зависит от доступности exact file у источника и прав
доступа: если файл удалён или доступ закрыт, приложение объясняет отказ и не
подменяет версию другой. Metadata остаётся доступной в сохранённых references.

