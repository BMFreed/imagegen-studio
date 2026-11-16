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

### Signed release declaration boundary

Main проверяет отдельный app-release envelope существующим canonical Ed25519
verifier. Он связывает выбранные native provider version, AppImage basename,
size/SHA512 и digest исходных release notes с подписанной declaration для
`studio.imagegen.desktop`, Linux/x64/AppImage. Project schema и CPU/inference
protocol declarations должны совпадать с текущими owners; каждый применённый
SQLite migration name/hash должен присутствовать в signed inventory. Это
проверка declaration и membership, а не исполнение будущих SQL migrations,
проверка внутренней версии binary или готовности установленного image engine.
После restart обычные handshake/setup/repair owners остаются обязательны.

Bundled `resources/app-update-trust.json` содержит только versioned app ID и
public Ed25519 keyId/PEM map. Он отделён от native `app-update.yml` feed config и
runtime publisher. При отсутствующем keyring настроенный legacy consumer
сохраняет `metadata-only`; некорректный существующий keyring не допускает fallback.
С keyring unsigned/mismatched release отказывается до native Download authority.
Неподписанные native policy `stagingPercentage`, `minimumSystemVersion`, `packages`
и выбранный `blockMapSize` не входят в конечный signed profile и отклоняются до
native availability evaluation. Это не объявляет доверенным весь feed или URL.

Public `signed-release` означает принятую signature, descriptor/notes binding и
compatibility declaration. На available/downloaded UI явно говорит, что image
engine будет проверен после restart; Install остаётся unavailable. Private
artifact capability повторно проверяет текущую selection и реальные cache bytes
и не передаёт пути/ключи/manifest в renderer. Будущий installer обязан отдельно
использовать эту revalidation boundary перед своим действием. Приватная capability
сама по себе не разрешает замену приложения, restart или закрытие Project.

Offline publisher CLI `scripts/sign-application-release.mjs` требует manifest,
raw notes JSON, реальный artifact, явные private Ed25519 key/keyId и новый output.
Он вычисляет artifact basename/size/SHA512 и notes digest, проверяет app domain
перед create-only output и не проверяет executable format, internal binary
version, исполнение migrations или installed-runtime readiness. Реальный клиент
сверяет свой installed context независимо от publisher declaration.

### Private staging boundary

[Private staging](../engineering/phase-5-application-update-staging-research.md)
подключён только через явный Main-private `stageForInstallation(expectedVersion)`.
Main захватывает текущий APPIMAGE target; renderer не задаёт путь назначения.
Пока нет staging IPC/UI, нового public status или действия Install. Обычные Check,
Download и status reads не создают stage и не запускают executable.

Gate требует текущий signed downloaded artifact и повторную проверку его native
cache authority. В собственном canonical parent текущего AppImage он создаёт
фиксированный exclusive sibling claim0700 и копирует candidate в новый inode0600
с проверкой signed size/SHA512, минимального ELF64 little-endian x64/AI2 header,
FD/path identities и fsync. Текущий regular single-link executable0755 и native
cache не перезаписываются и не удаляются; их bytes/modes сохраняются. Это
подготовка отдельной копии; header classification не доказывает запуск, внутреннюю
версию app binary, SQL migrations или installed image-engine readiness.

Durable journal описывает preparing/prepared state; отказ после получения claim
сохраняет его данные и по возможности durable failed marker. Любой существующий
claim отказывается без автоматического resume, cleanup или «исправления».
До activation возвращаемые prepared/backed-up capabilities повторно проверяют
старый executable, candidate, точные journal bytes/identities, canonical parent,
текущую selection и **native cache source capability**. Отдельный inode кандидата
не делает подготовленный plan независимым от cache authority. Сам stage не меняет
app binary, не исполняет его и не начинает Project close sequence.

### Private same-owner backup, activation and rollback

[Private transaction](../engineering/phase-5-application-update-transaction-research.md)
продолжает тот же exclusive staging owner. `prepareBackup` создаёт отдельный
fresh0600 inode с проверенными bytes текущего executable; текущий target и native
cache при подготовке сохраняются. Затем отдельная activation переводит проверенный
candidate в executable0755 и атомарно заменяет target pathname. Backup остаётся
отдельной сохранённой копией. Это Main-private filesystem capability, а не public
Install command, IPC/UI action или relaunch flow.

Перед activation service использует только assertion, переданный самим Main:
существующий app-data close barrier должен быть полностью finalized, а список
открытых Project tabs — пуст. Assertion синхронный, не принимает Promise и сам
не закрывает Project, worker или SQLite. Он проверяется до mutation и повторно
после последнего authority await перед публикацией. Finalized здесь означает
завершение существующего barrier, включая disposal SQLite, а не physical exit
Electron Main. Наличие backup или закрытого отдельного tab не заменяет этот guard.

После успешной activation новая private capability проверяет actual target,
backup, canonical directory и exact journal/identities самостоятельно. Revoked
selection или удалённый native cache больше не блокируют её verification и
same-owner rollback. Rollback создаёт fresh replacement inode из backup и атомарно
возвращает старые bytes/mode, сохраняя backup. Подменённый чужой target нельзя
перезаписать даже при совпадающих bytes: его identity должна оставаться принятой.

Журнал последовательно различает prepared, backing-up, backed-up, activating,
activated, rolling-back и rolled-back. Операции одного owner исключают друг друга;
совпадающие pending operations получают один результат. Consumed capability и
несовместимые concurrent operations отказываются, не превращая актуальную
capability в failed. Этот контракт не добавляет restart adoption/discard,
helper/relaunch, автоматическое восстановление после crash или проверку FUSE.
Публичный Install и release acceptance остаются открыты; shipping publisher не настроен.

## Scope and dependencies

[Private transaction](../engineering/phase-5-application-update-transaction-research.md)
имеет отдельную границу от раннего stage checkpoint: до activation нужна native
cache authority, после неё same-owner rollback опирается на собственный target и
backup. Точные результаты проверок и runtime limits записываются в research;
наличие этих owners не повышает публичные promise statuses и не доказывает
пользовательскую установку или запуск обновлённого приложения.

[Private staging](../engineering/phase-5-application-update-staging-research.md)
имеет Root-confirmed220 focused PASS, typecheck/build/scoped lint PASS. Отдельная
filesystem/module qualification с controlled authority прошла на сохранённом старом
AppImage147,106,530 bytes и точной late-candidate-guard GREEN/RED/GREEN.
AppImage не запускался; это не новый shipping artifact или Install proof.
Publisher остаётся не настроен. Публичные promise statuses этим срезом не повышаются.

[App-wide generation close impact](../engineering/phase-5-generation-close-impact-research.md)
now describes every pending/running queue row before native close, including rows
for Projects outside open tabs and private regional work. Open-tab counts are not
added again. The same existing shutdown owner cancels those pending rows after
confirmation; Cancel leaves them unchanged. Already canceled APP_RESTART rows are
terminal history, while closed-Project recovery results retain their existing
retention. This is the ordinary app-close prerequisite, not a frozen Install review
or an enabled installer.

[Model installer drain](../engineering/phase-5-model-install-shutdown-research.md)
now joins active model preparation/download/publication/storage work in the existing
app-close barrier before SQLite disposal. Main warns before confirmation, and
Cancel leaves that work running. This prerequisite does not supply Install Update,
the full recovered-job install preview or recoverable AppImage replacement.

[Local AppImage packaging](../engineering/phase-5-linux-app-package-research.md)
now supplies a versioned standalone app consumer and current-host extract-and-run
qualification. [Manual Check](../engineering/phase-5-application-update-check-research.md) now
uses the real Invoke/electron-updater metadata consumer through Help/Main/preload,
with explicit outcomes and no startup network check. [Explicit Download](../engineering/phase-5-application-update-download-research.md)
now uses that native downloader through an exact-version action, real progress
and final saved-file SHA-512/size verification, including reused cache bytes.
Download failure permits explicit retry. Closing the dialog leaves accepted work
running; reopen reads its Main state. No Cancel is exposed until native socket/file
drain is qualified. Check and status reads never initiate a download. Installation
remains absent; automatic download/install-on-quit are explicitly disabled. The
default build is unavailable until its own publisher configuration is supplied.
The earlier Download checkpoint verifies integrity relative to metadata.
[Signed release trust](../engineering/phase-5-application-release-trust-research.md)
adds the declaration/keyring and private artifact consumer described above; Root
confirms 190 targeted and 323 browser PASS, typecheck/build and partitioned full
lint PASS. Four actual fused-package flows give eight normal physical exits and
original GREEN / signature-bypass RED / original GREEN. No shipping publisher is configured. FUSE/clean-machine install,
binary replacement, interrupted-update recovery and actual upgrade compatibility
remain dependencies of the acceptance below. Runtime publisher metadata is a
separate lifecycle.

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
- Signed authority требует trust, exact app/target/descriptor/notes binding и
  текущие schema/protocol/migration declarations. `signed-release` не означает
  installed engine readiness; отсутствующий shipping publisher не подменяется
  тестовым feed или автоматически созданным ключом.
- Private stage сохраняет текущий executable и cache, создаёт только отдельный
  fresh inode и повторно проверяет private plan перед material action. Existing
  retained claim не удаляется и не принимается для повторного использования
  автоматически; stage не означает Install, activation или разрешение на restart.
- Private activation допускается только после finalized app-data close assertion
  Main и повторных authority/identity checks. Последующий same-owner rollback
  сохраняет backup и не зависит от native cache; он не перезаписывает чужой target
  и не подменяет restart/crash-recovery acceptance.
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
