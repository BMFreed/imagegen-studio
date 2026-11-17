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
engine будет проверен после restart. Install требует отдельного eligible Review,
поддерживаемого captured scheduler и обычного close consent, описанных ниже. Private
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
Сам stage не предоставляет staging IPC/UI или нового public status. Публичный
Install ниже вызывает его только после обычного подтверждённого close. Обычные Check,
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
Этот ранний transaction checkpoint сам не квалифицирует public Install; release
acceptance остаётся открытым, shipping publisher не настроен.

### Private exit-synchronized handoff

[Private relaunch](../engineering/phase-5-application-update-relaunch-research.md)
продолжает тот же activated owner: durable `relaunching` intent → full owned
snapshot → final synchronous guards → pinned Electron44.4.5 built-in relauncher.
Native bool проверяется как unknown: только literaltrue подтверждает handshake,
а не запуск приложения. False/throw/Promise после попытки означает uncertain;
backup сохраняется, автоматических retry/rollback/quit нет. Старые capabilities
больше не дают действий. Post-activation handoff не зависит от native cache.

Main-private `installAfterClose(version)` до создания stage требует captured
synchronous finalized/no-Project assertion и поддерживаемый scheduler, затем
использует прежние stage/backup/activation owners. Adapter передаёт только exact
current AppImage path и fixed `--appimage-extract-and-run`, без нового subprocess helper или inherited CLI.
Это штатный type2 runtime path для restart под NoNewPrivs; прямой повторный FUSE
mount не считается поддержанным relaunch.
Другие Electron versions не получают scheduler; Check/Download остаются прежними.

Это не новый public Install/IPC или close flow: user consent/Save/Discard/Cancel
при будущем Install должны проходить существующий обычный close handler. После
finalize нельзя возвращать disposed SQLite/UI в режим редактирования; failure
должен удерживать sealed normal-exit path. Helper handshake, native test fixture,
shipping binary, migration/runtime acceptance и crash recovery — разные границы.
Public Install/relaunch и авторизация recovery из journal не добавлены этим этапом.

Настоящий минимальный packaged fixture прошёл A0.1.0/FUSE → B0.2.0/extract-and-run:
два normal app/process exit0, тот же lock/profile/SQLite sentinel, точные signed B
и backup A, удаление FUSE mount и extracted AppDir. Это выполненный native путь
private service, но не Studio Project close/migration или shipping acceptance.
Финальные focused checks:322PASS/один platform SKIP; typing/build/scoped lint и
изолированный semantic GREEN/RED/GREEN прошли. Подробные evidence/limits — в research.

### Installation impact preview

[Installation preview](../engineering/phase-5-application-update-install-preview-research.md)
доступен отдельным `Review installation` только для текущей signed downloaded
версии. Main повторно проверяет native artifact до и после inspection; публичный
ответ содержит только version/counts/availability, без путей, prompts или installer
capability. Отображаются open/unsaved Projects, app-wide unfinished jobs (включая
закрытые Projects/private operations), unaccepted results открытых Projects,
active/preparing model installs и resource removal. При недоступном generation
storage оба generation count неизвестны, а не равны нулю.

Это снимок текущего Main state: обычный close заново применяет editor drafts и
проверяет guards. Preview не запускает Save, flush, fence, cancel, discard, close,
stage/backup/activation или restart. Existing staging inspection может проверять
и укреплять permissions recovery directories; byte-readonly filesystem guarantee
не добавляется. `Refresh preview` запрашивает новый снимок; `Install later`
закрывает модалку без consent на дальнейшее действие. Late replies после dismissal,
reopen или нового Check/Download не заменяют актуальный preview. Новый Install
ниже имеет отдельную authority/close границу; preview не повышает PP readiness.

### Explicit Install and ordinary close

[Public Install](../engineering/phase-5-application-update-install-research.md)
добавляет отдельный `Install and restart` только после current-document Review
текущей signed downloaded версии с `installationAvailable=true`. Этот boolean
означает наличие captured platform mechanism; permissions/space/header/identity
проверяет существующий stage owner после consent. Ненастроенный publisher и
unsupported scheduler сохраняют unavailable. `Install later` не начинает close.

Renderer передаёт только version. Main после asynchronous native-artifact
preflight заново проверяет renderer document/frame и отсутствие intervening close.
Ответ `close-requested` подтверждает только начало обычного close, не успешную
установку/новый процесс. Pending preflight блокирует повторный Install и competing
actions; обычный close dismisses Updates modal до Project/Preset guard. Reload
не может завершить старый preflight закрытием нового документа.

Один intent принадлежит одной close attempt. Draft flush, actual impacts,
Save/Discard/Cancel, worker/model/queue drain и Project close используют прежних
владельцев. Cancel/failed Save не создаёт update stage и не оставляет установку
для будущего обычного Close. Уже подтверждённые Saves/Close не откатываются.
Catalog admission закрывается и existing dataRoot lock дренируется до snapshot;
queued Open/Create не может добавить tab после него. Required draft/history writes
остаются доступны до sealed phase. Точная preflight artifact identity обязательна
после close: повторное скачивание той же версии не подменяет выбранный файл.

До irreversible finalize Main seals close. После этой точки не отправляются
tabsChanged/windowCloseReleased и не восстанавливается editing; sealed Project/
Model IPC отказывается. Finalize error пропускает installation, сохраняет обычный
recovery state и завершает приложение после уже подтверждённого worker/resource
drain. При storage error успешное закрытие SQLite не заявляется; сохраняется WAL
для штатного recovery. Успешный finalize вызывает существующий guarded activation/
handoff. Alt+F4 не пропускает ожидающие hashes/handoff. Любой postseal отказ даёт
fixed native diagnostic и normal exit, без automatic retry/rollback.

Это production wiring для configured signed feed, а не shipping/recovery
acceptance. Retained claim после restart ещё требует verified startup consumer;
subsequent updates, interrupted recovery/reinstall, copied-state migrations,
protocol/runtime validation и итоговая release matrix остаются gates. Unsigned
journal не разрешает adoption, cleanup или rollback. PP statuses не повышены.

Конечный native R4 прошёл production Main/preload/renderer, реальный Project Save,
SQLite disposal и A/FUSE→B/extraction с reopen точного prompt и двумя normal exits.
Это nonshipping bodies с явными CDP/dialog/timing controls и X11; engine и новые
migrations не квалифицированы. Проверки:352PASS/один platformSKIP, typing/build/
scoped lint и Main semantic GREEN/RED/GREEN; финальные42 затронутых browser cases
PASS после сохранённых исходных ошибок полного341-run. Точные уровни evidence,
три failed native attempts и retention5708 entries находятся в research.

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


### Retained signed authority and offline target inspection

[Offline startup authority](../engineering/phase-5-application-update-startup-authority-research.md)
сохраняет исходный signed envelope и полные canonical raw release notes отдельными
fsynced0600 members того же stage; schema2 journal хранит их snapshots/digests.
Текущий bundled keyring и применённые compatibility contracts проверяются заново
после restart, независимо от прежнего updater/cache. Missing signer, legacy/partial
stage, неизвестные members, unsafe paths или несовпадение current target сохраняют
recovery data без автоматических изменений. Startup не выполняет сетевой check.

Main выполняет read-only inspection до запуска Project/runtime/UI. Наличие
retained stage или невозможность безопасно доказать его отсутствие блокирует
Review и Install preflight до artifact/impact reads и Project close; отдельная
fresh проверка ловит stage, появившийся после startup. Публичное сообщение:
`Application update recovery is required before installation. Your Projects remain open.`
Check/Download/status и обычная работа с Projects остаются доступны.

Authenticated означает только совпадение текущего файла на диске с независимо
проверенным подписанным релизом и текущей app version. Это не доказательство
loaded-body identity, healthy startup или engine handshake и не разрешение
rollback/delete/retirement. Backup A не получает доверия из подписи target B.
Нужные exclusive ownership, executing-body proof и recovery/finalization consumer
остаются следующим отдельным этапом. Ни actual renderer load, ни per-dataRoot
single-instance lock эту границу не закрывают.


### Captured source consistency before close and publication

[Source-consistency consumer](../engineering/phase-5-application-update-source-consistency-research.md)
сохраняет одну ephemeral observation cached native ASAR descriptor, executable
и captured APPIMAGE. Ранний capture синхронный и metadata-only; полные hashes
завершаются под whenReady без смены baseline. Точный pinned Electron layout/key
обязателен; unsupported binding или неясный FD не заменяется свежим ASAR open.
Физические ASAR metadata читает original-fs. Runtime0664/0775 допустимы как
наблюдаемые modes; их drift и world-write отказываются. Mutable stage rules
остаются прежними. Native borrowed FD и shared offsets не закрываются/меняются.

После прежнего retained-stage veto Review/preflight повторно проверяют sources
до artifact/impact reads и после awaits; Main выполняет sync assertion перед
window.close. Здоровый скачанный B не превращается в download-error при
изменении current A. Существующий stage получает exact captured current-image
FileSnapshot и не выбирает новый A после close. Последний synchronous source
guard предшествует rename. Own activation потребляет old-target expectation;
последующие owned target/backup/journal guards продолжают работать.

Before-close typed refusal: `The application changed or could not be checked.
Restart ImageGen Studio before installing an update. Your Projects remain open.`
Project access/Save, explicit Check/Download/status сохраняются. Postseal failure
сохраняет прежний sealed normal-exit путь и не обещает открытые Projects.

Это стабильность наблюдаемых файлов после capture: не proof ранее загруженной
V8 memory, связи ASAR/executable с signed outer image, всех unpacked libraries,
healthy startup или global ownership. Pre-capture B1/B2 mismatch, legacy/unleased
процессы, разные dataRoots и retirement/recovery остаются открытыми. В Product,
provenance и persisted journal новая source capability не сериализуется.


### Signed publisher declaration of runtime files

[Runtime declaration consumer](../engineering/phase-5-application-runtime-declaration-research.md)
adds release payload schema2. Its fixed `runtimeFiles.archive` and
`runtimeFiles.executable` each contain only canonical SHA512 and positive safe
`sizeBytes`; they refer to `resources/app.asar` and `imagegen-studio`. The existing
external envelope signs these descriptors together with the outer artifact and
notes. Schema1 remains strict and target-only; its absence of runtime descriptors
never becomes successful runtime authentication. Keyring, envelope and stage
journal versions are unchanged.

For schema2 the offline publisher CLI requires `--runtime-directory` pointing to
the final appOutDir **after the complete AppImage build returns**. It hashes the
two fixed files itself, overriding any template fingerprints, and rechecks held
inputs before its create-only envelope output. For schema1 the option is refused.
Do not use an `afterPack` executable digest: builder applies fuses afterward.
`afterSign` is conditional and cannot serve as a general Linux completion hook.

```sh
pnpm exec tsx scripts/sign-application-release.mjs \
  --manifest /srv/imagegen-release/manifest-v2.json \
  --notes /srv/imagegen-release/notes.json \
  --artifact /srv/imagegen-release/imagegen-studio.AppImage \
  --runtime-directory /srv/imagegen-release/linux-unpacked \
  --private-key /srv/imagegen-signing/private.pem \
  --key-id release-publisher \
  --output /srv/imagegen-release/new-envelope.json
```

The association of this final app directory with the artifact is the trusted
publisher's declaration. CLI output explicitly reports
`containerContentsVerified: false` and `packageFormatVerified: false`. It does not
extract/execute an AppImage or prove containment; a wrong signed pairing remains
a publisher error. No real publisher URL/key is created or configured.

Main passes its ephemeral cached-ASAR/proc-executable/current-image observation to
the retained inspector. After target verification, only an exact schema2 tuple and
a still-valid capture can report runtime
`verified-publisher-declaration`. Missing/unsupported capture, wrong tuple or late
source drift retains runtime `unverified`; target verification remains a separate
result. A final synchronous source assertion accompanies the existing final
target/journal guards. No fingerprint/capability is exposed to the renderer or
serialized into Project, provenance or journal.

Both results preserve all recovery files and the existing retained-stage veto.
Neither authenticates earlier loaded V8 memory, unpacked libraries, all runtime
files, healthy startup, global process ownership or retirement. These remain
acceptance dependencies; public promise statuses are unchanged.


### Admission before explicit installation closes Projects

[Cross-dataRoot admission](../engineering/phase-5-application-update-admission-research.md)
adds a nonblocking OS gate for participating Install writers sharing a canonical
AppImage. After existing read-only preflight, explicit Install acquires a stable
sibling `.lock` descriptor before publishing its normal close intent. A competitor
refuses before Save/close and preserves Projects and the downloaded candidate.
Review, Check, Download, status and ordinary startup do not acquire it.

Cancel, failed Save or stale preseal intent closes only its owned descriptors.
The zero-byte user-owned0600 lock file remains on the same inode forever; its
presence alone is neither a live lock nor retained recovery/auto-install intent.
No candidate or backup is created before finalized close. Main checks admission
at close and through its existing finalized-close/stage/activation/relaunch guard.

Once sealed, the descriptor stays held until physical process teardown. Electron
synthesizes process `exit` from app `quit`, so neither that event, window close nor
handshake releases sealed admission. There is no arbitrary-FD transfer to B.
Existing retained-stage veto is preserved there.

The adapter uses fixed `/usr/bin/flock` in descriptor-only mode, without a shell,
background helper or ML runtime dependency. Missing/unsafe tool or unsupported
filesystem locking refuses Install with Projects open. Busy is shown as:
`Another application update is in progress. Try again after it finishes. Your Projects remain open.`
Other admission failures are normalized to:
`Application update installation could not be reserved. Your Projects remain open.`

This is updater-writer serialization, not global exclusivity of all executing
runtimes. Legacy/unleased processes, startup health and recovery/retirement remain
separate acceptance boundaries. No persisted schema or public status is promoted.

### Public startup recovery information

[Startup recovery status](../engineering/phase-5-application-update-recovery-status-research.md)
is a separate enum-only observation from Main's existing startup inspector. It is
available in Updates even when the publisher/feed is unconfigured. Unsupported or
unattempted inspection is explicitly `not-checked`; only an actual safe no-stage
inspection becomes `clear`. Required includes separately bounded target and
runtime verification facts. Runtime match requires target verification.

The service freezes the projection at startup and returns detached copies through
`getRecoveryStatus`. Reading it does not scan files, hash bytes, check the network,
acquire admission or change update selection. Existing getStatus polling remains
unchanged. The dialog requests recovery once on each open and discards late replies
after dismissal/reopen/unmount. There is no Refresh or recovery mutation action.

A required warning is independent of unavailable/checking/downloaded feed states.
It is labelled **At app startup**, describes preserved recovery data and available
Projects, and suppresses Review/Install offers. Clear displays no success card;
not-checked is neutral information. Pending/unreadable recovery information blocks
Review/Install in this dialog without blocking Check/Download. Errors are separate
from not-checked/clear; malformed data or missing methods cannot imply safe absence.

This snapshot is not continuing filesystem/health authority. A later stage still
fails the existing fresh preflight; external deletion never clears the sticky
retained-at-startup veto. No paths, manifests, keys, PID or backup execution data
are exposed. Current target/runtime matches do not establish healthy startup or
image-engine readiness. Recovery/reinstall, global runtime ownership, stage
finalization/retirement and shipping acceptance remain open.


Qualification: 636 Main PASS/one existing platform SKIP, 358 full browser PASS before
its local contrast correction plus 5 focused final PASS, exact semantic mutation
restoration and one actual packaged A→B with two normal exits. B has trust but no
publisher config; recovery/status reads, Check again and reopen preserve retained
bytes and the saved Project. The getter itself does no IO; opening Updates still
uses the existing manual Check flow, whose unconfigured B path returns unavailable
without HTTP. Full-browser original wrapper exit/duration are unavailable; complete
test JSON/footer and unit journal are retained. See the linked research for source
pins, controlled native ports, full/focused visual evidence and retention receipts.
This does not close recovery mutation or shipping acceptance.


### Historical state compatibility checkpoint

[Historical29→30](../engineering/phase-5-application-state-upgrade-research.md) now
qualifies one actual changed migration through the current packaged startup owner,
using exact historical producer source and a closed retained checkpoint at the same
canonical fixture path. It preserves prior rows/IDs/history, adds the empty 0030
identity table, and proves real Project prompt Save/reopen while actual transports
reject an incompatible controlled protocol peer. Two normal native exits and nine
settled wire children are qualified separately from old observer failures.

This is a synthetic empty-layer schema1 Project and source-compatible current
qualification dependencies. It does not establish arbitrary old-state migration,
historical desktop/CPython/ML compatibility, automatic production backup, downgrade,
recovery/retirement or shipping. All public promise statuses remain unchanged.


### Pre-migration database backup and manual recovery

[SQLite startup backup](../engineering/phase-5-database-migration-backup-research.md)
uses Invoke's online-backup mechanism before migrating an existing database,
including committed WAL data. Main awaits completion before starting services.
Freshly created empty storage skips a backup; an existing unversioned database
with data does not. Complete installed-name/hash validation precedes all SQL.
An up-to-date startup creates no extra backup. Backups are private independent
files in `<dataRoot>/database/app_backup_<date>-<time>[-N].db`. Collisions preserve
older files. There is no automatic backup pruning.

If backup fails, startup stops before migrations. Only the newly owned partial
main backup inode may be removed; unknown companions/replaced paths remain for
inspection. A successful backup is retained even when migration later fails.
The existing startup dialog reports that path. Earlier per-migration transactions
may already have committed; the active database must not be called unchanged.

Recovery follows Invoke's manual restore procedure:

1. Stop every application/tool process using this data root.
2. Choose a backup made before the relevant update. Do not select the latest
   automatically: a retry backup may contain an already partial upgrade.
3. Preserve the current `app.sqlite` **and its matching `-wal`/`-shm` files
   together** under separate unused names. Never leave the active old WAL/SHM
   beside a restored main file.
4. **Copy**, rather than move, the chosen backup to `app.sqlite`, retaining its
   owner and private `0600` permissions. Keep the original backup untouched.
5. Open with a version compatible with that database history. A newer version
   can migrate it again; an older incompatible version must refuse.

Database restore does not rewind `.igs`, models, staging or other app-data files;
newer files may be incompatible with an older app. This is a manual recovery path,
not automatic in-place restore/downgrade, app-binary recovery or full acceptance.

[Packaged historical upgrade with an installed engine](../engineering/phase-5-packaged-installed-historical-upgrade-research.md)
exercised the actual 29→30 backup and migration on the first Linux/NVIDIA host.
The same AppImage used the installed CPU worker to render a nonempty historical
Project on explicit Save and reopened it after normal close. The trained-model,
interrupted-update and shipping checks remain separate.
