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
   Размер выбранного файла должен быть известным положительным числом bytes:
   CivitAI `sizeKB` даёт оценку для preview, а закреплённый manifest либо ранее
   проверенная точная локальная копия — известный размер. Без такого размера
   preview показывает явный diagnostic и не разрешает установку; main повторно
   проверяет это условие до создания job и начала скачивания.
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
описание, preview, trigger words или activation tokens, file identity, размер,
hash и source link. Любой CivitAI checkpoint поддерживаемого семейства
Illustrious или Anima с поддерживаемым `.safetensors`-файлом можно установить
после обычной проверки источника и целостности; SHA-256 определяет точные bytes
и resource identity, но не служит списком разрешённых моделей.
Метка семейства `SDXL` в CivitAI сама по себе не означает `Illustrious` и не
включает checkpoint в поддерживаемый список. SDXL в названии loader'а и
проверки весов обозначает архитектуру Illustrious, а не третье семейство.

Для standalone VAE type-aware mapping принимает source label `Illustrious` или
`SDXL 1.0` как применимость компонента к Illustrious pipeline. Исходный `baseModel`
сохраняется в source metadata; это не утверждение о lineage VAE и не расширение
семейств checkpoint/LoRA. Другие source labels внешнего VAE сейчас отвергаются;
закреплённый Anima VAE сохраняет отдельную dependency identity. Проверенная
целостность установленного VAE не доказывает его ML compatibility: она требует
структурной проверки и actual loading следующим pipeline checkpoint.

Для нового Illustrious embedding activation token определяется приложением как
`<original safetensors filename stem>` одинаково в positive и negative prompt.
Исходное имя файла берётся из проверенной exact версии; display name и CivitAI
`trainedWords` используются для поиска, но не становятся activation/negative
alias. Уже скопированные токены Project не меняются. Совпадение имени файла у
нескольких установленных exact версий требует явного выбора; missing/corrupt
состояние другого владельца не делает оставшуюся версию автоматическим выбором.

CivitAI metadata и форма весов не доказывают Illustrious/SDXL `predictionType`.
Пользовательский override `epsilon` или `v_prediction` редактируется только в
Model Manager и хранится для точных SHA-256 и размера файла отдельно от source
metadata. Текущий эффективный тип берётся из override, явно известного значения
либо, если их нет, из `epsilon`, обозначенного как редактируемое предположение,
а не проверенный факт. Project показывает этот тип без собственного переключателя.
Поле `predictionType` в `.igs` и Preset остаётся справочным snapshot: оно не
решает, с каким типом будет выполнен следующий job, включая старые non-null и
`null` refs. Prepare повторно хеширует точный файл, берёт текущий эффективный
тип из библиотеки и замораживает его в job; accepted provenance сохраняет
фактически использованный тип. Ни библиотечная правка, ни Prepare не переписывают
`.igs` или Preset. Если override изменился между Prepare и materialization,
операция прерывается и требует повторного Prepare, без silent substitution.

Anima использует отдельный rectified-flow pipeline и не получает SDXL
`predictionType`. Каждый поддерживаемый custom Anima checkpoint устанавливается
вместе с закреплёнными Qwen3 encoder и VAE; установленная группа сама по себе
не доказывает структурную совместимость checkpoint. Generate требует проверки
структуры весов, компонентов и доступности worker;
при неудаче показывает причину до enqueue. Проверка SHA-256 остаётся обязательной
для точного файла и компонентов, но сама по себе не подтверждает совместимость.

Текущий [Anima loader foundation](../engineering/phase-2c-anima-qualification-research.md)
возвращает внутренний detached bundle из exact Project reference и linked
dependency versions, проверяя реальные SHA/size до и после bounded complete
header qualification. Поддерживается исходная Anima Base 1.0 topology, включая
custom checkpoints, без checkpoint SHA allowlist; companions остаются pinned.
Python отдельно проверяет exact snapshots и полный native state перед strict
loading. Этот bundle ещё не является generation request и не подключён к
Prepare/enqueue: weighting, conditioning, denoising и capability qualification
остаются следующей работой. Anima Generate по-прежнему явно отвергается.

Пользователь может управлять эксплуатационным поведением ресурса:

- выбирать установленную версию для Project;
- задавать default version для новых selections;
- менять Illustrious prediction type для точной версии файла;
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
- Project позволяет явно выбрать любую установленную версию; Generate с ней
  доступен после проверки точных файлов, структуры и обязательных компонентов;
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
  округлённая оценка CivitAI `sizeKB` не становится требованием точного совпадения
  downloaded bytes. Фактический размер сохраняется после проверки файла;
  repair использует ранее проверенные точные размер и SHA-256, reuse заново
  проверяет локальные bytes;
- missing или corrupted resource получает явный diagnostic;
- известную CivitAI-версию можно восстановить повторной загрузкой именно этого
  файла;
- presets и provenance остаются читаемыми после удаления локального файла;
- наличие другой версии той же модели не маскирует exact-version mismatch.

## Перенос точной ссылки между библиотеками

Локальные ID установленного ресурса могут отличаться на двух компьютерах.
Сохранённый `.igs` остаётся читаемым с исходной ссылкой; открытие проекта и
обновление каталога не переписывают её автоматически. Если в новой managed
библиотеке есть ровно один checkpoint с теми же CivitAI model/version/file ID,
SHA-256 и семейством, Project предлагает явное `Link installed version`.
Main повторно проверяет точный файл и закреплённые Anima-компоненты до изменения
документа. Точная привязка не доказывает структурную совместимость для Generate.
Привязка меняет только локальные ID ссылки, проходит через
dirty/shadow и попадает в `.igs` после Save. Несовпадение любой части точной
идентичности, неоднозначный кандидат или ошибка проверки оставляют исходную
ссылку без изменений. Имя и версия Default не служат ключами сопоставления.
Это действие не импортирует произвольный файл по пути и не сканирует папки.

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
- отсутствующий, нулевой или некорректный размер запрещает новую установку с
  объяснением, без install job, download и публикации; известные точные размеры
  pinned Anima и установленного файла для repair/reuse сохраняют эти flows;
- install job имеет наблюдаемые progress, status, cancel/retry и error;
- модель регистрируется только после проверки файла;
- exact duplicate не скачивается повторно без явного действия;
- несколько версий одной модели могут существовать одновременно;
- доступная новая версия видима, но не устанавливается автоматически;
- установка обновления не удаляет и не перезаписывает старую версию;
- default version влияет только на новые selections;
- существующие Projects, Presets и provenance сохраняют exact version identity;
- missing или corrupted version можно диагностировать и восстановить;
- поддерживаемый CivitAI Illustrious/Anima `.safetensors` checkpoint можно
  установить независимо от наличия его SHA-256 в app-owned manifest;
- Illustrious `epsilon` по умолчанию явно помечен как редактируемое предположение;
  override относится к точным SHA-256 и размеру, Project показывает текущее
  значение read-only, а frozen job сохраняет фактически выбранный тип;
- Generate блокируется с объяснением при повреждённом файле, неподдерживаемой
  структуре или отсутствии обязательных компонентов; Anima устанавливается с
  закреплёнными Qwen3/VAE, но не получает SDXL `predictionType`;
- model selectors получают ресурсы из одной библиотеки Model Manager;
- новый embedding ref создаётся только main после проверки managed bytes и
  exact source/version/token; renderer передаёт текст и IDs без metadata/paths;
- уникальный canonical embedding token может автоматически связаться при вводе,
  collision остаётся unbound до явного выбора; existing missing ref сохраняется,
  пока его буквальный токен присутствует;
- portable embedding relink проверяет CivitAI source/hash/family и меняет только
  локальные IDs, сохраняя скопированные token/display/version metadata;
- model card показывает source metadata, но не редактирует её.

## Текущее состояние и границы

Vue-прототип интерактивно моделирует обнаружение новой версии, предпросмотр,
установку рядом со старой, явную смену default и сохранение прежних точных
Project/Preset/Result references. Это mock-поведение, а не доказательство
production persistence.

Production Electron Model Manager устанавливает файл из CivitAI URL в managed
storage, ведёт SQLite-версии и очередь, восстанавливает известную точную версию,
проверяет целостность и меняет default только явно. Production Project выбирает
установленный checkpoint и его точную версию из этого каталога. Main принимает
от renderer только ID, повторно проверяет файл и необходимые Anima-компоненты,
после чего сохраняет неизменяемую ссылку с hash/metadata в `.igs`. Смена default
не переписывает существующий Project; отсутствующая точная версия остаётся
читаемой с предупреждением и не заменяется соседней. Интеграционные тесты
проверяют SQLite, файловую систему и Project Save/reopen, а Electron smoke —
пользовательский выбор версии. Последующие [LoRA](../engineering/phase-2c-lora-research.md)
и [VAE authoring](../engineering/phase-2c-external-vae-authoring-research.md)
checkpoints подключают свои exact selectors; внешний VAE проходит
install/repair/clear/relink и Project Undo/shadow/Save/reopen. Последующий
[external VAE inference](../engineering/phase-2c-external-vae-inference-research.md)
проверяет точную source identity, SHA/size и standalone LDM/native Diffusers
header anchors перед обоими normal modes; worker 0.9.0 проверяет полный набор
тензоров и загружает выбранный VAE через public offline AutoencoderKL с pinned
SDXL scaling. Одинаковая форма тензоров не доказывает training lineage. Старый
worker, неподдерживаемый профиль или changed bytes явно блокируют Generate;
Retry сохраняет исходную версию независимо от нового Default. Полную ML
compatibility всех моделей, Preset handoff
и full accepted-result provenance эти проверки ещё не доказывают;
PP-004 остаётся неполным и публично не обещается как готовый flow.

[Exact embedding authoring](../engineering/phase-2c-embedding-authoring-research.md)
подключает установленную Illustrious embedding версию к обоим Project prompts
через autocomplete, main verification и атомарную запись text+refs. Existing
identity сохраняется при смене Default, rename или потере файла; Delete/Clear
prune и Project Undo/Redo, shadow recovery, Save/reopen сохраняют согласованность
текста и refs. Explicit Link меняет только local IDs. Монотонный epoch и revision
отклоняют позднюю verification после edit/Undo или закрытия вкладки, включая
асинхронную commit boundary. Проверены реальные SQLite/filesystem и `.igs`
writer/loader; авторинг не доказывает tensor compatibility. Anima embedding
actions unsupported. На authoring checkpoint Generate с refs и known unbound
literal отказывал до enqueue. Следующий
[embedding inference checkpoint](../engineering/phase-2c-embedding-inference-research.md)
подключает обе Illustrious prompt-полярности к paired CLIP safetensors через
worker 0.10.0. Main проверяет exact source/hash/size и bounded header перед
материализацией, batch publication, Retry и dispatch; worker использует один
verified snapshot, проверяет полный формат, finite values и преобразование к
dtype энкодеров. Каждый concrete branch выбирает effective subset из frozen
pool; unused choices и текущий Default не подменяют Retry. Same-token resources
двух polarities разделены; longest-first stored literals имеют приоритет над
вложенными known tokens. Unsupported/changed/unbound input отказывает явно,
без plain-text fallback. Synthetic public-loader/native pipeline evidence не
доказывает качество обученных embeddings или совместимость каждого source-файла.
Статус PP-004 не повышен.

Для быстрого открытия каталога его статус файла проверяет metadata, путь и
размер, используя результат полной проверки, если он уже есть в кэше.
Поэтому `ready` в списке — предварительный статус: main заново считает SHA-256
при выборе точной версии и при будущей постановке Generate job. Ошибка выбора
не создаёт Project reference. После переноса `.igs` Project предлагает явную
привязку при единственном точном совпадении с новой managed библиотекой;
main повторно проверяет файл и меняет только локальные ID через документный
Save. Сервисные тесты используют два независимых SQLite-каталога, а Electron
smoke проверяет действие из импортированного Project. Настоящие веса и worker
этот сценарий не загружает.

## Связанные contracts и evidence

[Model Manager](../features/model-manager.md) определяет installation UI,
ошибки и [prototype gaps](../features/model-manager.md#vue-prototype-coverage);
[Data Storage](../specs/03-data-storage.md) — persistent resource identity.
[model-manager.spec.ts](../prototype-app/tests/model-manager.spec.ts) проверяет
mock version lifecycle, но не доказывает production download или repair.
`src/main/models/*.test.ts` проверяют локальное хранилище и очередь, но не
generation worker и Project references.

В Electron Project `Manage Models` передаёт локальные ID выбранного checkpoint
и версии: менеджер показывает нужную карточку даже после других фильтров,
помечает версию как `Selected in Project` отдельно от библиотечного `Default`.
Детали версии (файл, prediction type, trigger words) относятся к выбранной
версии, даже если Default другой.

Отсутствующий локальный ID объясняется предупреждением, без подстановки другой
модели. [Resource handoff](../engineering/phase-2c-resource-handoff-research.md) расширяет
этот flow на пустые и выбранные checkpoint/LoRA/VAE controls и embedding diagnostics.
Project entry задаёт категорию независимо от exact reference; закрытие обновляет
реальный каталог без автоматического выбора новой версии. Native checks отдельно
проверяют точную версию против Default, сохранение Project/`.igs`, возврат фокуса
и появление восстановленного exact файла. Восстановление bytes в fixture —
управляемый collaborator, не доказательство CivitAI repair/download. Preset
handoff и локальные thumbnails остаются открытыми; embedding authoring и
отдельные Illustrious LoRA/VAE worker paths описаны checkpoints выше.

[Model Manager presentation reads](../engineering/phase-2c-model-manager-read-research.md)
отдельно проверяют запоздавшие catalog/jobs/storage/token ответы и ошибки после
нового открытия, ownership loading и сохранение observed job updates вместе с
нетронутыми строками полного списка. Эти renderer guards не отменяют команды
установки и не заменяют их Main-owned lifecycle. Native read-ordering fixture
не доказывает download, repair или secret-storage mutation.

Успешное восстановление зависит от доступности exact file у источника и прав
доступа: если файл удалён или доступ закрыт, приложение объясняет отказ и не
подменяет версию другой. Metadata остаётся доступной в сохранённых references.
