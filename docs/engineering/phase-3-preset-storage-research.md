# Фаза 3: хранилище пресетов и native API

## Проспективная граница

Base: `master`, `87d6d7dfb1442d3eecfeb764f363ddad82a10111`. Изменение high risk:
новая SQLite persistence и окончательное удаление просроченных tombstones.
Контракты: [PP-006](../product-promises.md#pp-006-настройки-генерации-можно-сохранять-и-переиспользовать),
[Presets](../features/presets.md), [Storage](../specs/03-data-storage.md).

Confirmed до реализации: production API/таблица presets отсутствовали; approved
editor существовал только в prototype. Цель этого среза — строгий portable payload,
CRUD/duplicate, soft delete/restore, истечение срока, IPC/preload и Main lifetime.
Подключение production manager, Apply, New Project и result-to-preset остаётся
следующим срезом. Этот API сам не изменяет Project, библиотеку моделей или файлы `.igs`.

## Инварианты и параметры

- Источник списка секций — двенадцать ключей approved `GenerationPayload`.
  Отсутствие секции сохраняет target, `loras: []` очищает стек, `vae: null`
  означает Embedded. Sampling хранит только явно заданные named members.
- Exact resource references копируются, без FK на установленную модель:
  недоступный ресурс не делает сохранённый пресет недопустимым. Model prediction
  type/noise profile — advisory snapshot, policy остаётся в Model Manager.
- Workflow хранится как `txt2img/img2img/inpaint`; публичные domain names
  `textToImage/imageToImage/smartPatch`. TXT удаляет strength при записи;
  возврат к IMG не придумывает значение. Fixed seed допускает 0/uint32;
  random/reuse хранят policy, не фактический completed cursor проекта.
- Размер 8..32768 использует portable raster ceiling, а не обещает generation
  capability такого размера. Name 1024 bytes, description/prompt 1MiB, definition
  16MiB наследуют portable `.igs` ceilings. Решение для metadata: ≤64 tags,
  ≤128 UTF-8 bytes/tag. Превышение отвергается до записи.
- Срок — ровно 30×24 часа UTC, не календарный месяц/DST. На границе `>=`
  восстановление запрещено. Повторный delete не продлевает окно.
- Main запускает purge при старте и раз в час (операционное решение для
  длительно открытого приложения); закрытое приложение удалит при следующем
  старте. Restore проверяет срок независимо от очередного sweep.
- Все preset operations имеют одного app-lifetime владельца. Shutdown
  прекращает admission/timer и ждёт принятые операции до SQLite close.
- Purge транзакционен: повреждённая candidate запись вызывает typed refusal,
  сохраняет все строки и не отключает остальные возможности приложения.
  Нет silent repair/drop, update не воскрешает удалённую запись.

## План проверки и отказов

Реальные strict parsers и SQLite/migrations/reopen; missing resources, signed LoRA,
seed 0, absent/empty/null, corruption и rollback. Проверить до/ровно/после срока,
restore/purge race и миграцию с v16 без потери соседних данных. Native renderer →
preload → Main → SQLite с restart и structured failures; соседние Project/model
records остаются прежними. Semantic mutation срока должна дать RED только на
границе, соседний before-deadline control — GREEN; восстановление исходника
обязательно. Serial bounded runs, никаких ML weights/runtime copies.

## Исполненное evidence и review

- Focused serial Node pass: 193 tests, 0 failed/cancelled/skipped. Настоящие
  parsers, database migrations/SQLite/reopen, repository/service/IPC и соседние
  `.igs` schema, generation shutdown и both-family preparation/refusal owners.
  Это focused suite; весь `app:test` не запускался. Новые preset globs добавлены
  в стандартную команду для последующих прогонов.
- `preset-repository.test.ts`: реальное удаление model resource не каскадирует
  copied refs; held genuine SQLite result даёт наблюдаемые transaction races;
  trigger на втором DELETE доказывает rollback первого. Upgrade с 16 миграций
  сохраняет ordinary data и exact-file policies, новая migration — 0017.
- Service tests проверяют настоящий default hourly timer через intercepted
  scheduler, startup expiry, отсутствие overlap, shutdown during startup,
  запрет всех семи поздних операций и drain настоящей transaction перед close.
  IPC tests вызывают зарегистрированные production handlers/real repository,
  проверяют чужого sender/frame, 25 malformed requests и corrupted-row refusal.
- Native `smoke-presets.mjs`: 7 named checks, 3 actual Electron sessions/physical
  exits. Renderer → built preload → Main → SQLite: create/update/duplicate,
  fixed seed 0, literal prompt/sidecars, missing refs, explicit Embedded/empty
  stack, unknown keys, soft-delete и restart/restore. Только один owned tombstone
  состарен fixture-изменением до 31 дня при закрытом Main; startup purge удаляет
  его и оставляет свежий восстанавливаемым. Настоящий созданный Project `.igs`
  и app_metadata marker — non-vacuous controls. После restart rebuildable
  `project_index`/`project_accepted_result_index` сравниваются отдельно от
  durable neighbors; нет claim, что их operational timestamps неизменны.
- Две isolated semantic mutations: purge `>= → >` даёт 5 TAP failures
  (один parent включает boundary leaf), 22 GREEN; отсутствие canonical stored
  definition guard даёт 2 failures (leaf + parent), 25 GREEN. Before/after-deadline
  controls и остальные corruption variants проходят. Оба byte-exact restored
  runs — 27/27 GREEN. Первоначальный race assertion использовал поздний await
  rejection; его заменили на Promise.all, чтобы semantic RED оставался обычным
  assertion failure без dangling rejection. Исходный raw attempt сохранён,
  итоговые counts относятся к corrected r2.
- `pnpm run typecheck`, scoped formatting, full lint и desktop build — PASS.
  Final native replays используют actual final source/bundle SHA, 14 handoff
  checks/2 exits и 7 preset checks/3 exits; это повторы тех же finite cases,
  а не расширение ML qualification. Prototype UI не менялся, поэтому `prototype:test` не требуется.
  Python/ML не менялись и не запускались; в native preset probe нет image worker,
  весов, CUDA или mock substitution реального Main API.

Review честно разделён: root — self-review; другой агент прочёл schema/API/service/
IPC/Main и не нашёл substantive reachable findings. Repository и часть tests
созданы этим же агентом, поэтому их review не называется слепым. Продуктовый
полный PP-006 flow остаётся открытым до production UI/Apply/result-to-preset.

Raw evidence: `~/.codex/artifacts/imagegen-studio/runs/preset-storage/20261013-checks/`.
Controller регистрирует реальный PID/start/cgroup до выполнения, swap 0 и finite
deadlines. Serial CPU checks 2GiB, typecheck/lint 6GiB; native actor и app по2GiB,
фактические группы/physical exit записаны отдельно. Managed ML environment не
копируется и не используется. После independent physical-exit proof всех своих
actors и byte-exact restoration удалены только шесть owned fixture/copy payloads:
освобождено 29,466,624 allocated bytes. Compact set ≈2.4MB сохраняет reports,
logs, screenshots, mutation originals/manifests и две final `.igs`/SQLite snapshots.
Original model files, ordinary app data и shared ML environment не затронуты.

Final raw reports: `delivered-handoff/report.json` и `delivered-presets/report.json`
в указанном run root; после cleanup их `fixtureRoot` — исторический disposed
payload, живые сохранённые snapshots находятся в `compact/`. Первая formatting
команда включала SQL, для которого не установлен Prettier parser; отказ setup
не является semantic RED. Исправленные scoped formatting/typecheck/lint/build
прошли. Phase2C ledger отдельно описывает исправленный native locator attempt.
