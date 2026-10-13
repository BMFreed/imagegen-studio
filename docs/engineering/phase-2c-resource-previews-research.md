# Phase 2C — локальные previews установленных ресурсов

## Область и исходное состояние

Авторизованный следующий пункт roadmap после NoobAI Karras refusal. База:
`1ad12e903f4873942878b6ab4a356bf80eef8a76`. PP-004 и
[Model Manager](../features/model-manager.md) требуют Main-owned fetch/cache и
worker-created derivatives; недоступное изображение не меняет installed или
Generate-ready status. Полный model lifecycle и Presets этим срезом не закрываются.

Confirmed при чтении: CivitaiClient загружает только HTTPS CivitAI/image.civitai.com,
без redirects/token, до 1 000 000 bytes. ModelService сохраняет исходный data URL в
`model-source-previews/<URLSHA>.txt`; это не обработанный worker derivative.
ModelInstallCoordinator сохраняет URL на resource, и новая версия перезаписывает
его. Version metadata не содержит URL; поэтому картинка может относиться к другой
версии. Отсутствующий cache запоминается как null на весь срок жизни ModelService.

## Реализация и сохраняемые границы

- Источник сохраняется в metadata exact version. Resource projection использует
  default version; выбранная exact version — собственную картинку или fallback.
  Для старого каталога resource URL используется только при единственной версии:
  принадлежность URL одной из нескольких исторических версий неизвестна.
- Main получает bounded source, общий `ProjectTargetInspectionOwner` вызывает
  новую optional capability `resource-preview` существующего CPU worker.
  Новый process owner/runtime, CUDA qualification и renderer network не нужны.
- Worker нормализует ICC/EXIF в sRGB и сохраняет alpha/aspect без crop/upscale.
  Main назначает scratch/output paths и проверяет настоящие выходные bytes,
  SHA, media, ICC и размеры перед публикацией. Offline read проверяет cache заново.
- Cache — disposable, URL-keyed, versioned, metadata публикуется последней.
  Никакой preview не меняет checkpoint identity/default, Project references,
  source metadata при repair, `.igs` или provenance. Raw legacy `.txt` не является
  доверенным renderer preview.
- Нет runtime/capability, decode/fetch/cache failure: текстовый fallback;
  сохранённые derivatives доступны без worker и сети. Concurrent same-source
  запросы объединяются; null не сохраняется навсегда. Shutdown/exit fence общего
  owner распространяется на эту операцию.

## Заранее выбранные ограничения

Implementation choices, не измеренные продуктовые максимумы: preview longest side
512 px, thumbnail 96 px (38×42 list/picker и больший details preview); worker
range preview32…512/thumbnail32…128. Источник ≤1 000 000 bytes — существующий
Main CivitAI limit; decode geometry/profile limits наследуются от image imports.
WebP derivatives имеют pinned sRGB ICC. Загрузка не обязательна для установки.
Source/derivatives хранятся только в app-owned cache, stage в существующем scratch.
Source/preview ≤1 000 000 B, thumbnail ≤128 000 B; Main data URLs ограничены этими
bytes, без remote URL/path. Новые builds сериализованы, offline hits обходят очередь.
Negative backoff30s конечный и не продлевается чтениями. Network fetch выполняется
до worker lease, после advisory runtime check. `read()` никогда не строит artwork;
операционные ModelService callers используют его, UI IPC явно запрашивает build.
`useWorker(..., { retainCompletedResult: false })` требует подтверждения exit;
stage cleanup следует за этой границей, при WORKER_EXIT_UNCONFIRMED stage остаётся.

Risk high: недоверенные downloaded pixels, worker output и filesystem publication.
Отказы: malformed/oversized image, подмена SHA/profile/media, symlink/foreign path,
частичные outputs, crash/timeout, unavailable/old worker, shutdown и поздний ответ.
Последствие ошибки — unsafe renderer image/cache или потеря доступности каталога;
поэтому публикация следует реальной проверке, а отказ optional и не затрагивает
модель. Interrupted stage/entry без metadata не читается как готовый preview.

## План evidence

Настоящие worker codecs и JSONL → verified Main outputs; cache filesystem/reopen
offline, corruption/symlink, concurrent requests и failure без publication.
Production ModelService/SQLite — две версии с разными source URLs, default change
и отсутствующая картинка без заимствования соседней. UI screenshot/interaction
проверяет manager/picker, но не является ML qualification. Semantic mutation
отдельно проверит существенный cache или version-ownership invariant.

Runs serial, CPU-only: 2 GiB для targeted tests, 6 GiB для typecheck/lint,
swap0 и конечный deadline. Inventory перед run: artifact root28 GiB, free44 GiB;
новые evidence/payloads планируются ≤64 MiB. Существующий managed ML pool не
используется и не копируется. Evidence:
`~/.codex/artifacts/imagegen-studio/runs/resource-previews/20261013-checks/`.

## Выполненные проверки

- Real worker/Pillow CPU tests:74 PASS (resource previews, imports, derivatives,
  protocol). Output pixels/profile/EXIF/alpha/transparent geometry и atomic failure
  проверяются по настоящим файлам, не по заранее объявленному output DTO.
- Final Node focused suite:251 PASS/0 skipped. Main cache/actual filesystem,
  independent WebP stream validation, source URLs/limits; реальный JSONL client,
  truthful/dishonest peers; SQLite installer→version metadata→catalog→default,
  restart и сохранность portable refs. Реальная timeout/exit boundary содержит
  child-written observation до exit и проверку после awaited physical closure.
  Image sources, tiny catalog model bytes и controlled exit refusal названы mocks;
  эти tests не заявляют ML compatibility.
- Native built Electron:6 finite assertions и4 focused screenshots на1380×900 и
  900×680. Два независимо собранных160×80 PNG проходят настоящий CPU worker/cache.
  LoRA options показывают обе exact картинки; UI Add/Save сохраняет B. Focused
  manager показывает B рядом с defaultA thumbnail. Default→B не меняет Project
  checkpointA/LoRAB. Offline restart без runtime pointer/CPU adapter возвращает
  cached images и Added state; Main request count0 после post-launch контролируемого loopback fetch: actual Undici observer
  видит заранее captured fetch (1 request в каждой сессии), затем после reset
  UI catalog/Save/restart дают0 requests. Простая подмена global fetch сама по себе
  не доказывала бы отсутствие сети в ранее созданном CivitaiClient. Новые images до launch —
  fixture fetch, IPC/cache/renderer и Save настоящие. T3 preview открывался, но
  HTTP browser не предоставляет native Electron preload/IPC; использован
  checked-in `_electron` system-test harness, без подмены production renderer.
- Native actor2GiB + actual owned native scope2GiB, swap0,300s deadline; observed
  первый combined owned peak730 013 696 B. ML pool/runtime/weights не использованы. Child exits
  подтверждены для обеих сессий, без завершения чужих процессов.

Три изолированные semantic mutations:

| Нарушение                                                           | RED / соседние GREEN | Byte restore + GREEN |
| ------------------------------------------------------------------- | -------------------- | -------------------- |
| Картинка resourceB назначается всем exact versions                  | 5/3                  | 8                    |
| Aspect/no-upscale нарушены: обе картинки принудительно512×512/96×96 | 8/17                 | 25                   |
| Scratch удаляется внутри callback до worker exit                    | 2/23                 | 25                   |

Geometry mutation проверяет CPU codec function, не JSONL child: один subprocess
case deselected, потому что isolated interpreter peer `-I` использует исходный
checkout. Healthy real JSONL case прошёл отдельно. Исходный checkout/managed pool
не мутировался. Изолированные copies byte-restored, затем физически idle.

Отклонённые setup/static attempts:3 Ruff long-line errors и strict Python
unnecessary isinstance исправлены; owner test peer сначала отправлял неверные
protocol/id fields, исправлен только fixture. Один mutation setup получил EINVAL
из-за слишком длинного Unix socket TMPDIR пути tsx CLI; повтор выполнен через
`node --import tsx` и дал именно semantic RED. Эти отказы не считаются RED.
Final typecheck, full ESLint, Ruff check и BasedPyright PASS; build PASS.
После final default-null control (resource image fallback, own version artwork
остаётся доступен) Node251/typecheck и targeted lint повторены. Нет prototype
изменений; prototype:typecheck входит в typecheck, prototype screenshots не
подменяют production evidence.

## Границы и остатки

Legacy raw `.txt` не мигрируется в новый verified cache: понадобится первый fetch
source. При неизвестном exact URL нескольких старых версий картинка не угадывается.
Interrupted unindexed cache entries и unconfirmed-exit scratch намеренно не
sweep-удаляются; known safely owned superseded entries удаляются после publication.
Broader cache maintenance, full model hard removal/Preset ownership, public CivitAI
network и packaged runtime delivery не квалифицированы. Generic runtime CPU resolver
и old-capability fallback проверены, но installed ML43-file qualification этой
работой не повторялась. PP-004 сохраняет «Пока не обещать». Следующий пункт —
оставшиеся exit checks Phase2C перед production Presets.

## Финальная передача и cleanup

Финальный native evidence: `delivered-native/report.json` в указанном run root.
После source-style/observer/default-null изменений проводка повторена на новой
сборке:6 assertions/4 screenshots, две confirmed native closures, actual Main
network observer controls1/1 и post-control requests0/0. Последний combined owned
peak 578568192 B, zero swap; первый730 013 696 B остаётся
историческим максимумом этого UI среза. Source/bundle hashes находятся в reports.

Raw outcomes и rollback-source bytes сохранены. Все isolated copies byte-restored;
перед удалением повторно подтверждены исходные PID/start и отсутствие живых owners.
Удалены только зарегистрированные clone/test/native payloads этого run:
43151360 allocated B. Остались compact reports/bounds/logs/registrations,
screenshots и один фактический Save `.igs`/каталог после Default switch; run занимает
около1.6 MiB. Artifact root после cleanup — 29419016192 allocated B.
Существующий большой reusable ML pool и предыдущие pinned evidence не использованы
и не удалены; необходимость прежнего compact-budget exception этим срезом не
снимается. Новых environment/weights dependencies у run нет. Interrupted cache
orphans и реальные app data пользователя этой очисткой не затрагивались.

Full code review не нашёл оставшихся material gaps в пределах этого среза.
Нативные модели всё ещё fixtures, public CivitAI download/release остаются отдельной
проверкой. Broader MVP readiness не повышается по thumbnail evidence.
