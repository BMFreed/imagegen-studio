# Исправления по аудиту продуктовых обещаний

Base: `daa0963befda718f3fd0c215dba88a9309d70901`, 2026-09-30. Scope — три
подтверждённые находки независимого аудита и уточнённый отказ установки без
размера CivitAI-файла. Это исправление существующих контрактов, не расширение
MVP и не объявление PP-001–PP-008 публично готовыми.

## Фактический seed при принятии результата

Риск высокий: immutable provenance, recovery и portable `.igs`. По
[worker protocol](../specs/05-worker-protocol.md) корректный `done` может
сообщить uint32 seed, отличный от запланированного. Processor и staging уже
сохраняли такой результат, но mapper при Add ошибочно требовал равенства.

Mapper сохраняет проверенный фактический seed и отказывает недопустимому
uint32. Проверка происхождения результата остаётся в staging: его манифест
должен совпадать с durable completion receipt, включая actual seed. Renderer
не передаёт значение seed для принятия. Frozen request и его запланированный
seed не переписываются; формат provenance и версия `.igs` не меняются.

Regression входит через настоящий `GenerationProcessor.runOne`, SQLite queue
и staging, затем `ProjectGenerationAcceptance.accept`, autosave/shadow и
реальный writer/loader `.igs`. При planned `42` случаи actual `42`, `0`,
`65535` и `4294967295` должны создавать слой и сохранять именно actual seed,
исходные PNG bytes и last-actual-seed snapshot. До Save основной файл остаётся
неизменным. Отдельный контроль меняет actual seed только в опубликованном
staging-манифесте: Add должен отказать без изменения документа/файла и без
удаления PNG. Возвращённый исходный манифест снова проходит проверку.

В этих tests внешний inference transport подставлен, а tiny checkpoint
не проходит реальную ML qualification. Настоящие владельцы storage и
acceptance не подменены. Это не проверка CUDA inference и не утверждение,
что текущий Python pipeline обычно изменяет полученный seed.

Старый mapper unit test менял seed напрямую в клоне candidate и ожидал отказа.
Он смешивал разрешённый ответ worker с подменой опубликованного результата.
Теперь допустимый seed проверяется отдельно от manifest/receipt tampering через
настоящий staging owner. Уже сохранённые verified candidates с отличающимся
seed можно принять без миграции; отказ по некорректному seed не создаёт слой.

## Вкладки standalone Project prototype

Риск средний: выбранная вкладка должна однозначно определять документ.
`?prototype=project` показывал фиксированную ProjectB session при выборе ProjectA,
а выбор Home оставлял Project. Используется общая композиция Home/Project и
сессия выбранного документа. Уже посещённые Project-компоненты сохраняются
для независимого undo и локального состояния.

Browser regressions проходят одинаковые действия на standalone и integrated
маршрутах: правка ProjectA помечает только ProjectA, ProjectB сохраняет свой prompt,
Home отображается при выборе Home, возвращение сохраняет Project state.
Это UI/mock evidence; оно не доказывает production persistence.

## Размер файла перед установкой

Риск высокий: явное согласие на загрузку и ресурсный lifecycle. CivitAI
возвращает `files[].sizeKB` в
[официальном API](https://github.com/civitai/civitai-developer-docs/blob/main/site/reference/model-versions.md).
Живые unauthenticated metadata-запросы 2026-09-30 подтвердили размер у 51 файла
пяти Illustrious-моделей и у конкретной версии `2786084`, file `2672243`.
Размер уже читался нашим клиентом. Предыдущий audit observation с отсутствующим
полем был искусственным отказным входом, а не найденным ограничением API.

Известный корректный размер требуется до создания install job и download.
`Size unknown` не разрешает скачивание. Проверенные локальные exact bytes
могут дать размер для repair/reuse; закреплённые Anima component sizes
сохраняют свой контракт. Предварительный CivitAI размер остаётся source
estimate: его нельзя превращать в строгую byte-integrity проверку. После
download проверяются реальные bytes/hash и доступный Content-Length.

Тесты используют настоящий client/service/coordinator/downloader, SQLite и
временные файлы с управляемыми ответами внешней сети. Реальные веса, аккаунт
и OS credential backend не проверяются этими fixtures.

Main сообщает `MODEL_SIZE_UNKNOWN` (`ANIMA_SIZE_UNKNOWN` для Anima checkpoint),
UI показывает `Download size unavailable` и отключает Install. Пользователь
может обновить preview либо выбрать файл с известным размером. Проверка main
выполняется до создания job, а при потере reuse-файла в очереди повторяется до
download. Ранее проверенный размер repair остаётся точным integrity bound.

Затронутые параметры: actual seed — uint32 по worker protocol; CivitAI estimate
— `round(sizeKB × 1024)`, допустим только положительный safe integer bytes;
pinned Anima sizes — существующий manifest. Estimate не определяет точный размер
ответа сервера. Фактические hash/size checks и лимиты downloader не меняются.
Общий guard затрагивает checkpoint, LoRA, embedding, VAE и upscaler imports;
отказные controls покрывают эти типы, положительные соседи — install,
repair/reuse и Anima companions.

## Согласованность документации

Текущая inventory в
[document lifecycle](../features/project/document-lifecycle.md) теперь
указывает native Add, durable recovery adoption, journal и последующий Save.
Generate/full inference, early Add и Smart Patch остаются отдельными gaps.
Исторические checkpoint notes не представлены как текущая карта готовности.

## Выполненные проверки

Проверялся dirty working tree поверх указанного base, включая новые test files.

| Проверка                                                             | Фактический результат                                                                                                           |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Processor → Add → Save/reopen, новые seed regressions на base        | 2 passed / 4 failed: same-seed и tampering controls зелёные; допустимые отличия seed блокируются старым mapper                  |
| Processor, provenance, acceptance и staging suites после исправления | 70 passed / 0 failed / 0 skipped                                                                                                |
| Новые ownership tests до исправления вкладок                         | 2 standalone failed / 2 integrated passed                                                                                       |
| Новый browser набор и соседние Project/audit scenarios               | 42 passed                                                                                                                       |
| Новые CivitAI size regressions до исправления                        | 3 passed / 9 failed: отказные installs и local repair/reuse не соблюдали требование известного размера                          |
| CivitAI client, model service, Anima coordinator и downloader suites | 70 passed / 0 failed / 0 skipped                                                                                                |
| Adjacent upscaler install/restart controls                           | 2 passed                                                                                                                        |
| `pnpm run app:test`                                                  | 522 passed / 0 failed / 0 skipped                                                                                               |
| `pnpm run prototype:test`                                            | 156 passed                                                                                                                      |
| `pnpm run typecheck`, `pnpm run lint`, `pnpm run prototype:build`    | Passed                                                                                                                          |
| `pnpm run app:smoke`                                                 | Passed: native Home/Manager IPC, Project Save/reopen, crash recovery, Results preview/export/discard и Add/shadow/portable Save |

Первый общий app run выявил старый positive upscaler fixture без `sizeKB`.
Fixture теперь передаёт размер реального тестового buffer; assertions на
скачивание, hash, storage и restart сохранены. Первый lint run нашёл import
ordering, numeric separators и лишние assertions типов; они исправлены.

Semantic mutations выполнены только в изолированных копиях, затем удалены:

- Записать planned seed вместо actual: 4 failed / 2 passed, включая parent test;
  три differing-seed cases падают на фактическом сохранённом значении.
- Убрать сравнение seed с durable receipt: tampering test падает
  (`Missing expected rejection`), 5 соседних checks проходят.
- Убрать known-size отказ: 12 failed / 5 passed; восстановленный guard —
  17 passed. Восстановленный seed набор — 6 passed.

Отдельный агент, не автор production правок, провёл их независимый review;
это source-guided review, не слепой аудит. Помимо focused suites, восемь
временных invalid worker-seed cases отказали без publication, а два независимых
size controls подтвердили, что маленькая estimate не ограничивает реальные
bytes и что repair отказывает неверному точному размеру. Блокеров не найдено.

Visual pass включал просмотр actual before/after screenshots: standalone ProjectA
и Home в 1280×800/1440×900; production Model Manager с неизвестным/известным
размером в 1280×900 и отказный dialog в 900×620. Диагностика читается, Install
отключён только при недопустимом выборе, footer остаётся в viewport. Проверка
Model Manager использовала настоящий Vue/Naive renderer с fixture `window.api`,
не native IPC. T3 browser подтвердил ProjectA dirty ownership и Home navigation;
его snapshot endpoint отказал, поэтому appearance проверен сохранёнными PNG
из browser harness. В Model Manager одинаковый Naive slot warning присутствовал
до/после, page errors отсутствовали. Сохранённый Project screenshot pass также
не зарегистрировал page errors; общий prototype dev server позднее сообщил
`ResizeObserver loop completed with undelivered notifications`. Причастность
patch к этому уведомлению отдельно не измерялась. Build сообщил large-chunk
warning; успешное выполнение не означает устранение этих предупреждений.

Seed Save regression передаёт `lastActualSeedSnapshot` непосредственно в
autosave owner: это проверяет serialization, но не отдельную renderer lookup
проводку. Anima sparse downloader fixtures проверяют group lifecycle и pinned
аргументы, а не реальные multi-GB bytes. GPU inference, release installer,
normal renderer Generate и оставшиеся MVP gaps этим исправлением не закрыты.

Логи, mutation recipes и PNG сохранены отдельно от исходного неизменяемого
аудита: `/home/user/.codex/artifacts/imagegen-studio/audits/2026-09-30-fixes/`.
