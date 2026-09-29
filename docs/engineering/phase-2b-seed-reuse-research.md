# Seed Reuse: локальный cursor и переносимый Save snapshot

**Risk:** high — изменение SQLite migration, `.igs` Save и recovery shadow.
**Контракт:** [Dynamic Prompting](../features/project/generate-mode/dynamic-prompting.md#seed-behavior),
[Data Storage](../specs/03-data-storage.md#источники-истины), PP-007/008 в
[Product Promises](../product-promises.md).

## Ожидаемое поведение и граница

Фактический seed появляется только после проверки PNG и долговечного завершения
candidate. `Reuse` при постановке job фиксирует последний фактический seed этого
Project, сохраняя политику `reuse` отдельно от числа; при отсутствии seed
подготовка останавливается с явной причиной. Локальный cursor не делает Project
dirty и не создаёт Undo step. Явный Save переносит его snapshot в `.igs`; без
Save новый seed остаётся только на этом компьютере. Непринятые изображения
по-прежнему не включаются в `.igs`.

Затронутый путь: worker result → проверенный staging manifest/receipt → SQLite
completed row и cursor → Project Results IPC → Seed control; при Generate —
Project identity → cursor → frozen target → prepare → frozen queue input; при
Save — cursor → ProjectService → autosave coordinator → ProjectSession package
commit → recovery shadow/rebase. Отдельный `.igs` snapshot служит fallback,
когда локального cursor для данного Project нет.

## Проверенная причина и решение

До изменения `generation_seed_cursor` имел только ключ локального пути. Новый
`.igs` по тому же пути мог прочитать seed прежнего `documentId`; это нарушало
границу Project. Миграция добавляет `document_id` и доверяет старой строке
только при совпадении candidate, completion order, actual seed, completed
receipt и сохранившегося completed queue item. Неподтверждённая старая строка
остаётся `NULL` для чтения и не подставляется в `Reuse`.

Чтение cursor теперь требует одновременно local project key и portable
`documentId`. Новое completion атомарно записывает оба идентификатора. Если
позже по тому же пути завершится уже другой документ, cursor переходит к нему;
старый документ не получает его seed. Discard candidate и prune terminal
queue row cursor не откатывают.

Варианты «искать последний seed по queue row», «взять seed из принятого слоя»
и «случайный seed при отсутствии cursor» отвергнуты контрактом: queue можно
очистить, слой мог не быть принят, а тихий fallback меняет смысл `Reuse`.
Сохранение cursor как обычного document edit также нарушило бы dirty/Undo.

## Отказы и восстановление

- Canceled/failed job, непроверенный PNG либо receipt без completed commit:
  cursor остаётся прежним. Startup reconciliation завершает publication только
  по проверенным файлам и receipt.
- Recovery storage недоступен при Save: Project сохраняется с прежним `.igs`
  snapshot и существующей логикой placeholder preview; пользовательские правки
  не блокируются из-за отсутствия ML/runtime. После восстановления storage
  локальный cursor вновь доступен.
- SQLite cursor читается после потенциально долгой сборки preview, перед
  Project Save. Если candidate завершился во время preview, Save включает его
  seed. Completion после этого чтения остаётся локальным до следующего Save:
  SQLite и `.igs` не имеют общей атомарной транзакции.
- Ошибка до atomic `.igs` rename: portable snapshot не меняется. После rename
  сохранённый snapshot определяется чтением committed package; shadow сравнивает
  точный hash Save target и сохраняет более поздние document edits.
- При переносе `.igs` без локальной SQLite записи подготовка использует
  сохранённый snapshot. Число `0` — валидный seed, не признак отсутствия.
- Закрытие приложения отменяет незавершённые jobs; оно не продвигает cursor.

## Evidence и ограничения

Исходная path-only схема и completion transaction проверены в
`generation-staging.ts`/migration 0006. Реальный SQLite-тест миграции покрывает
доказанный и недоказанный legacy cursor; отдельный тест подменяет документ по
тому же пути. Семантическая мутация без фильтра `document_id` приводит к
красному тесту на замену документа. Подготовка и очередь проверяют, что
операционный seed имеет приоритет над сохранённым, `0` проходит и значение
остаётся frozen после более позднего completion; мутация, игнорирующая
операционный cursor, приводит к красным тестам.

`pnpm run app:test` прошёл: 476/476, 0 skipped/failed. `pnpm run typecheck`
и `pnpm run lint` прошли. `pnpm run app:smoke` прошёл после свежего build:
Electron восстанавливает реальный candidate из SQLite/staging, показывает
доступный `Reuse`, сохраняет seed 42 в `.igs` только по Save и после discard
оставляет cursor 42. Отдельный сервисный тест завершает generation во время
preview и проверяет, что Save снимет более новый seed. Save/shadow тесты
проверяют commit, отсутствие dirty/Undo, конкурентную правку и crash/reopen.
Изолированная мутация, вернувшая seed в сравнение editable shadow content,
вновь вызвала `SHADOW_INVALID_REQUEST` в новом тесте.

Production renderer Generate action и полноценный
release inference pipeline ещё отсутствуют: этот checkpoint доказывает
внутренний Prepare/queue/Save и отображение cursor, но не сквозную генерацию
из интерфейса. Перед релизом нужны Linux/NVIDIA packaged runtime и сценарий
UI → GPU → completed output → Reuse → Save/reopen. Сигналы отказа сейчас —
явная ошибка `GENERATION_SEED_UNAVAILABLE`, storage recovery unavailable и
recovery status Save; путь восстановления — restart/reconcile либо portable
`.igs` snapshot. Нет отдельного сетевого или облачного fallback.
