# Application Updates

## Feature

Пользователь может проверить наличие новой версии самого ImageGen Studio и
установить её из основного окна приложения. Это не обновление модели или Python
ML runtime.

## Reference

Invoke launcher: `~/Work/sources/launcher/`, проверенный commit
`c267bdb439519216b277a7a8c6ad408b9d79efce`. Его
`src/main/updater.ts` последовательно вызывает check, download и install, но
`src/main/main-process-manager.ts` запускает check при старте окна. ImageGen
Studio использует только подходящие механизмы загрузки и проверки, сохраняя
своё решение о ручной проверке и одном основном окне.

## ImageGen Studio decision

Первый Linux/NVIDIA релиз включает действие `Проверить обновления` в основном
приложении. Только это действие инициирует сетевую проверку версии: нет
автоматической проверки при запуске или в фоне. Результат показывает текущую
версию и найденную версию с доступными release notes. Скачивание/установка
нового пакета требуют отдельного явного действия; поиск версии сам по себе
ничего не устанавливает и не завершает приложение.

Если сеть недоступна, сервер ошибся или обновлений нет, приложение остаётся
рабочим, показывает соответствующий результат проверки и разрешает повторить
её позже. Повреждённый/непроверенный пакет нельзя передавать installer'у.
Перед restart для установки пользователь завершает обычный Project close flow:
dirty `.igs`, pending/running jobs и unaccepted staging не пропадают молча.
До начала close sequence UI показывает, что придётся сохранить/закрыть, и даёт
`Установить позже` без изменения проектов/очереди. После начала sequence
действуют обычные Project close rules: отмена любого close guard останавливает
restart, но уже подтверждённые Save/Close не откатываются. Уже скачанный пакет
сам не запускает restart. После interrupted update данные пользователя остаются на месте,
а проверенный recovery/reinstall path должен вернуть приложение в рабочее
состояние. Конкретные гарантии замены app binary определяет и доказывает
Linux package/update mechanism, выбранный перед фазой 5.

Renderer показывает состояние и действия, main process владеет проверкой
release metadata, download, integrity/trust validation и handoff installer'у.
Обновление app package само не чистит app data, `.igs`, модели, staging recovery
или previous known-good runtime. Подтверждённое закрытие Project может
отбросить staging по обычным правилам; это отдельное явное действие. UI не
открывает отдельный launcher window.

Release metadata сообщает совместимые worker/runtime protocol versions.
Обновление приложения не делает старый runtime автоматически совместимым:
после upgrade main проверяет handshake и при необходимости предлагает
обычный staged runtime update/repair в том же окне. Пока он недоступен,
Project Save с placeholder preview остаётся доступен. SQLite migrations и
открытие прежних `.igs` проверяются на копии пользовательского состояния до
релиза; неуспешная миграция не должна превращаться в silent data loss.

## Scope and dependencies

Обязательный scope первого релиза. Зависимости: Electron main/preload API,
single-instance shell, Project close/recovery и Queue Manager. Python worker
для проверки или установки Electron package не нужен. Linux package/update
channel, формат доверенного manifest и способ восстановления после сбоя —
инженерный контракт [релизной фазы](../specs/01-implementation-roadmap.md#фаза-5-первый-linuxnvidia-релиз).

## Promises

Ручной check и отдельная установка следуют [PP-002](../product-promises.md#pp-002-явное-намерение-вместо-магического-control).
Сохранность `.igs` и явное завершение jobs/staging защищают
[PP-007](../product-promises.md#pp-007-проект-принадлежит-пользователю) и
[PP-008](../product-promises.md#pp-008-генерация-меняет-проект-только-по-явному-решению).
Наличие этого контракта не повышает их публичный статус до production checks.

## Acceptance criteria

- До нажатия `Проверить обновления` приложение не выполняет app-update check.
- Check с сетью/без сети/при ошибке даёт понятный результат и не меняет
  установленную версию, Project или runtime.
- Загрузка и установка начинаются только после отдельного действия; пакет
  проверяется до handoff installer'у.
- Dirty Project, active jobs и unaccepted staging не исчезают без обычного
  close/cancel confirmation. `Установить позже` до close sequence ничего не
  меняет; последующая отмена останавливает restart, не откатывая ранее
  подтверждённые Save/Close.
- Испытание на собранном Linux package покрывает clean install, успешный
  update, повреждённую загрузку и interrupted update/recovery без удаления
  `.igs`, моделей и app-managed recovery.
- Upgrade на машине с уже установленными runtime, моделями, SQLite и `.igs`
  проверяет protocol handshake, корректные миграции и понятный setup/repair
  при несовместимости. Existing Project можно сохранить даже пока ML runtime
  требует восстановления.
