# Python Runtime And Dependency Management

## Решение

ImageGen Studio не использует системный Python и не изменяет активное Python-окружение при установке или обновлении worker'а.

Первый release target — Linux с NVIDIA GPU. Один Invoke-like inference pipeline
поддерживает Illustrious (на архитектуре SDXL) и Anima с LoRA; альтернативных
inference engines, включая отдельный ComfyUI backend, нет. Diffusers/PyTorch — внутренние
зависимости этого pipeline. Будущий platform/device port потребует проверенного
runtime artifact и self-test того же pipeline, а не автоматического fallback на
другой engine.

Зафиксированный stack:

- `pyproject.toml` — стандартное описание Python-проекта и его зависимостей;
- `uv.lock` — единственный lock-файл с точными версиями;
- `uv` — единственный Python dependency/environment manager;
- app-owned CPython — точная версия интерпретатора, которой управляет ImageGen Studio;
- versioned runtime environments — отдельное окружение для каждой устанавливаемой версии worker/runtime profile;
- staging, self-test, atomic activation и rollback — ответственность Electron main process/runtime manager.

Poetry не используется. Одновременное использование Poetry и `uv` создало бы две конкурирующие модели управления окружением и потенциально два lock-файла, не добавляя защиты от частично выполненной установки.

## Встроенный setup и Invoke launcher как reference

Runtime status, setup, progress, repair и diagnostics показываются в основном
окне ImageGen Studio. Отдельного launcher application/window нет. Main process
владеет операцией установки, renderer получает только доменные DTO и может
оставаться доступным без рабочего Python worker. Ручная проверка и явная
установка обновления самого Electron-приложения тоже находятся в этом окне,
но используют отдельный
app-package lifecycle; они не заменяют и не переустанавливают worker runtime.

Локальный reference checkout Invoke launcher:
`~/Work/sources/launcher/`, проверенный `main` —
`c267bdb439519216b277a7a8c6ad408b9d79efce` (25.09.2026). Для Linux/NVIDIA
полезны `download_uv.ts` (download/checksum), `src/main/gpu-detection.ts`
(advisory GPU probe), `src/main/install-manager.ts` (progress/error lifecycle)
и `src/main/index.ts` (single-instance). Их поведение нужно проверять на
закреплённой ревизии перед адаптацией; это source reference, не зависимость.
Launcher открывает отдельное Invoke-окно после server startup; здесь такой
переход не нужен. Его repair удаляет `.venv` перед переустановкой, а sync
использует `--inexact`; оба решения противоречат нашему инварианту staging,
exact install, self-test и rollback и не должны копироваться. Широкие
OS/GPU branches и custom Torch index UI не входят в первый Linux/NVIDIA
release. При переносе кода отдельно проверяются license/NOTICE obligations.

## Главный инвариант

Неудачная установка не должна повреждать последний рабочий runtime.

Мы не пытаемся «ремонтировать» активный `venv` последовательностью `pip install` / `pip uninstall`. Любая установка, смена Python, обновление PyTorch или восстановление runtime выполняется в новом staging environment. Активный runtime переключается только после полной проверки нового.

```text
download verified artifacts
↓
create versioned staging runtime
↓
install/sync exact locked dependencies
↓
run integrity and worker self-tests
↓
atomically update active-runtime pointer
↓
keep previous runtime for rollback
```

Если любой шаг завершается ошибкой, staging удаляется или помечается неполным, а приложение продолжает использовать предыдущий runtime.

## Собственный Python

ImageGen Studio использует собственную точную сборку CPython и запускает worker по абсолютному пути.

Запрещено полагаться на:

- `python` или `python3` из `PATH`;
- Python из Microsoft Store;
- `/usr/bin/python` и пакеты системного дистрибутива;
- Conda/Miniconda окружение пользователя;
- случайно активированный пользовательский `venv`;
- глобальный `site-packages`.

Python входит в platform runtime artifact либо загружается как проверенный app-managed artifact при первой установке runtime. `uv` может использоваться для получения и создания managed Python в development/bootstrap flow, но выбранная версия и artifact identity фиксируются release manifest'ом.

Обновление Python всегда создаёт новый runtime рядом со старым. Интерпретатор и его environment не обновляются на месте.

## Расположение на диске

Runtime принадлежит приложению, но не устанавливается внутрь Electron executable/application bundle. Каталог программы может быть read-only, требовать elevated permissions, заменяться при app update или быть подписанным bundle.

Production runtime хранится в per-user app data. Следующие пути показывают
platform-neutral layout; наличие Windows/macOS paths не обещает их поддержку в
первом release:

```text
Windows: %LOCALAPPDATA%\ImageGen Studio\
Linux:   $XDG_DATA_HOME/imagegen-studio/ или ~/.local/share/imagegen-studio/
macOS:   ~/Library/Application Support/ImageGen Studio/
```

Предварительная структура:

```text
ImageGen Studio/
├─ runtime/
│  ├─ python/
│  │  └─ {python-version}-{platform}-{arch}/
│  ├─ environments/
│  │  ├─ {active-runtime-id}/
│  │  ├─ {previous-runtime-id}/
│  │  └─ {next-runtime-id}/  # unpublished during install
│  └─ current-runtime.json
├─ cache/
│  ├─ uv/
│  └─ runtime-downloads/
└─ logs/
   └─ worker/
```

Каждый `runtime-id` обозначает отдельную установку, в том числе повторный
Repair той же версии; новый environment не занимает путь активного.

`current-runtime.json` содержит identity активного runtime и абсолютный путь к его Python executable. Для переключения не требуется активировать `venv`, изменять глобальный `PATH` или использовать shell startup scripts.

Runtime, модели и пользовательские проекты имеют разные lifecycle:

- runtime можно пересоздать без удаления моделей;
- uv/download cache можно безопасно очистить без повреждения активного runtime;
- checkpoints, LoRA, VAE и embeddings не входят в Python environment;
- `.igs` и workspaces не зависят от расположения runtime.

### Общие вспомогательные веса для outpaint

Решение 06.10.2026: LaMa устанавливается вместе с первой установкой движка.
Встроенный setup заранее показывает полный объём загрузки, включая эти веса.
LaMa — общий вспомогательный ресурс Invoke-like outpaint для Illustrious и
Anima; он не привязан к выбранному checkpoint и не входит в `.igs` или Python
environment. Main владеет загрузкой, cache, проверкой закреплённых identity/hash
и выдачей проверенного локального пути. Worker выполняет infill без скачивания
или выбора альтернативного ресурса.

[Main-owned LaMa delivery checkpoint](../engineering/phase-2c-lama-install-research.md)
реализует внутренние exact download/install/reuse в `appData/inference-resources`
и byte planner по trusted полному runtime manifest с обязательной LaMa. План
повторного использования заново проверяет файл; увеличение показанного объёма
требует нового preview. Auxiliary preview считает только веса и явно обозначает
свой scope, а не весь движок. Download staging bytes не означают достаточный
disk-space peak: publisher copy, unpack scratch и old slots учитываются будущим
установщиком отдельно. Installed size остаётся unknown при неизвестном footprint.

[Reviewed engine composition](../engineering/phase-5-engine-lama-composition-research.md)
adds an opt-in internal `engine` backend over already obtained exact expanded
runtime and signed cached transport. Main authenticates their exact envelope
binding and the pinned LaMa preview before issuing its one-use review token.
The existing planner distinguishes `sourceCached` from installed `reused`: a
cached archive does not remove the new slot's unknown installed footprint. The
engine review returns `requiredFreeBytes: null` for the unknown aggregate peak
and names the signed slot floor separately as `runtimeRequiredFreeBytes`.
Explicit Install/Repair performs host and early pointer checks before consuming
the auxiliary plan, then verifies LaMa and uses the unchanged new-slot
qualification/activation/rollback controller. LaMa is verified again after each
qualification phase. This is composition of separate owners, not an atomic
transaction deleting valid shared weights on later runtime failure. Public
provider/preview IPC/UI and reopened aggregate auxiliary health remain future
consumers; default Setup stays unavailable.

[Reopened outpaint resource health](../engineering/phase-5-runtime-outpaint-health-research.md)
adds optional advisory `RuntimeStatus.outpaintInfill: ready | needs-repair` beside
Python/GPU `kind: ready`. Omission means uninspected, not healthy. Public Main
supplies the existing recovered verification-only LaMa resolver; every status
read rechecks actual canonical/pinned bytes independently of the GPU cache.
Failure changes only the outpaint projection. Existing ordinary inference,
metadata admission, CPU derivatives and per-operation outpaint authority remain
unchanged. Preload validates the enum on getters/events. The existing notice
supports explicit Check again and distinguishes a refused partial-resource
Repair action from a connection/status error; the latter still blocks generation.
No new install/download path or public release trust is supplied, and default
Install/Repair remains unavailable. This does not establish complete engine or
regional-reference resource health.

[Native engine qualification](../engineering/phase-5-native-engine-qualification-research.md)
adds the explicit `full-engine` qualifier profile. It accepts original signed
transport, external public keyring/app version, bound wheelhouse proof and exact
local LaMa source, adopts the existing extractor's selection without re-signing,
and uses the production assembler/workers/engine controller. Actual Install,
new-slot Repair and post-activation refusal/rollback are exercised on one host;
LaMa has an installed CUDA 64² execution check through its existing worker owner.
The auxiliary network is a controlled local copy port, not a public delivery
qualification. The original manager startup failure remains generic; a separate
same-slot CUDA-hidden diagnostic supplies code 78 and the concrete unavailable
reason. This does not qualify public Setup, shipping trust, upgrade/distributable
compatibility, reopened aggregate health or checkpoint image/visual acceptance.

[Internal offline installation](../engineering/phase-4-runtime-offline-install-research.md)
добавляет Main-owned signed inventory, exact offline assembly в новых final slots,
две qualification-фазы, atomic pointer и rollback/recovery. Вход — уже полученный
payload от доверенного Main backend; host и auxiliary readiness обязательны.
Локальный review имеет scope `python-runtime-slot` и не заменяет полный engine
preview. Public Set up/Install/Repair остаётся недоступным без shipped release
selection/keyring, полного wheelhouse, qualified host inspection, download и
aggregate preview IPC/UI. Успешная CPU fixture с последующим отказом inference
не квалифицирует Linux/NVIDIA release.
Текущий development runtime не получает LaMa автоматически от этого checkpoint;
worker не скачивает недостающие веса.

Portable mode может позже использовать каталог рядом с приложением только как явный режим и только после проверки прав записи. Это не default production layout.

## Development environment

В разработке worker использует локальное окружение рядом с Python-проектом:

```text
worker-python/
├─ pyproject.toml
├─ uv.lock
├─ .python-version
├─ src/
├─ tests/
└─ .venv/
```

`.python-version`, допустимый Python range в `pyproject.toml` и lock-файл находятся в version control. `.venv` не коммитится.

Обычные команды:

```bash
uv sync --locked
uv run ruff format --check src tests
uv run ruff check src tests
uv run basedpyright src tests
uv run pytest
```

Зависимости меняются через `uv add` / `uv remove`, после чего обновлённый `uv.lock` проходит CI. Ручной `uv pip install` в project environment не является способом объявить постоянную зависимость: всё необходимое worker'у должно присутствовать в `pyproject.toml` и lock-файле.

### Текущая реализация и developer qualification

[Manual application Check](../engineering/phase-5-application-update-check-research.md)
is a separate Electron metadata lifecycle. It does not install/update Python,
models or the application binary; no app-update request occurs on boot or status
reads. No shipping feed is configured. Runtime publisher/compatibility and app
binary download/install/recovery remain separate open gates.

[Standalone Linux app package](../engineering/phase-5-linux-app-package-research.md)
qualifies the Electron app payload locally: actual fused AppImage, native SQLite,
30 bundled migrations and built static consumers, real Project create/reopen and
normal physical close. It ships no Python environment or model weights and does
not replace the existing runtime artifact/installer owners. Runtime publisher
remains unconfigured. Extract-and-run on this host does not qualify shipping
trust, clean-machine install/upgrade, app updates or final MVP acceptance.

[Setup progress and Cancel](../engineering/phase-5-runtime-setup-progress-research.md)
connects actual stage/constituent-byte callbacks to transient Main snapshots and
strict getter/event/cancel IPC. The consumed review token identifies the current
operation; Main checks the target before abort. Cancelling remains pending until
existing work physically settles and operation fences clear. Final actual success
can win a late Cancel; unknown exit or failed rollback remains recovery-required.
Confirmed local assembly cancellation retains its cancellation code after the
controller's recovery gates. No aggregate percentage/readiness is inferred from
transfer bytes. Reload reads/restores active work; stale document/revision/id
responses cannot replace a newer operation. Main restart uses existing durable
journal/status recovery, not transient progress. Publisher/discovery, distribution,
upgrade/update and final visual/MVP acceptance remain separate.

[Metadata-first consumer](../engineering/phase-5-runtime-metadata-provider-research.md)
adds an optional Main backend over already obtained authenticated metadata and
separately trusted keys/source policy. Preview verifies metadata, inspects exact
existing cache/LaMa and reviews full bytes without acquiring/extracting runtime.
Existing mode/token consent and host/pointer guards precede deferred cache,
extraction and unchanged installation/rollback. Cached-source loss cannot turn
a reviewed zero transfer into a new download. Public projection keeps twelve
fields and distinguishes metadata provenance and actual verified cache.
A failed incomplete cache needs an explicitly selected fresh owned attempt; no
implicit deletion, partial resume or fallback is introduced. User confirmed that
shipping metadata/artifact URLs and trusted publisher identity do not exist yet.
Default Main remains unavailable; publisher provisioning/discovery, operation
progress/cancel and release acceptance remain separate.

[Setup confirmation consumer](../engineering/phase-5-runtime-setup-ui-research.md)
connects Set up/Repair in the production App to the existing engine review. The
Vue/Naive dialog shows download/installed/additional bytes, cached source and
outpaint reuse, with the signed runtime floor separate from unknown aggregate
peak. Only explicit confirmation sends its current mode/token. Cancel/Escape or
unmount dismisses unconsumed review; pending preview/dismissal is serialized and
late replies cannot reopen it. Accepted operations show pending text and cannot
be dismissed as if that cancelled installation. Failure requires fresh review.
The unavailable partial-outpaint Repair remains separate from connection errors.
Metadata-first review is recorded above. This UI checkpoint itself supplies no
shipping provider, public operation progress/cancel or release readiness.

[Packaged clean Setup and Repair](../engineering/phase-5-packaged-runtime-setup-repair-research.md)
exercises the same review and explicit confirmation in the private
qualification AppImage. The signed release installs on ext4 and reopens
ready. Repair reuses the verified transport, installs the missing LaMa
resource and activates a distinct slot. The previous worker still starts
while the new pointer remains active. The separate
[packaged rollback control](../engineering/phase-5-packaged-runtime-rollback-research.md)
then confirms a candidate worker refusal after activation, restoration of
the exact previous pointer and normal reopen with the previous runtime.
The [stock startup after installer death](../engineering/phase-5-packaged-runtime-installation-recovery-research.md)
check distinguishes the recoverable pre-publication cut from the retained
post-activation qualification cut. Both preserved the slots and saved Project.
Shipping delivery and the supported host matrix remain open.

[Public setup review/token IPC](../engineering/phase-5-runtime-setup-ipc-research.md)
adds engine-only `previewInstallation(mode)`, explicit review dismissal and
optional token arguments to install/repair. Only the current trusted main frame
may use them. New/failed preview, dismissal, main-frame navigation, renderer loss
and closure revoke public intent; matching token is consumed before delegation.
The internal RuntimeManager capture/controller remains installation authority.
Native diagnostic paths are normalized to fixed public errors. Legacy zero-arg
actions always refuse unavailable without mutating the core, preserving current
partial-outpaint Repair behavior.

The flat DTO describes already verified **local cached source**, not a network
pre-download offer. It omits paths, keys, auxiliary IDs and expanded payload byte
counts; unknown total peak remains null, separately from the signed runtime
floor. The App confirmation consumer is recorded above. No shipping provider/
keyring/endpoints are supplied; nothing downloads implicitly through this
checkpoint. Metadata-first provider, operation progress/cancel and distributable/
update acceptance remain separate.

Public Main пока не передаёт shipping release provider. Его legacy zero-arg
Install/Repair и preview без provider возвращают `RUNTIME_INSTALL_UNAVAILABLE`;
новый публичный token path использует существующий internal capture/controller.
Внутренний verified offline backend и полный Python-slot qualification уже
реализованы и имеют отдельные checkpoints ниже. Публичный Setup дополнительно
требует trusted transport/download/extraction, полного engine review и LaMa;
проверка существующего app-owned pointer сама по себе это не заменяет.

- `pnpm run app:qualify:provision` — явная подготовка нового изолированного
  app-data root: копирование managed CPython 3.12.13, online `uv sync --locked`
  с inference extra и `--no-editable`, проверка installed payload и offline
  config, реальный Linux/NVIDIA startup и публикация pointer только с `--activate`.
- `pnpm run app:qualify:generation` — отдельная опциональная проверка через
  собранный Electron и fixture с существующими trained files: обычные UI/IPC,
  Main qualification, queue/worker/staging, явный Add и Save/reopen. Подготовленный
  model catalog является предусловием; CivitAI installation этим не проверяется.

Запускать из корня checkout, заменив абсолютные placeholders ниже. `<fresh-root>` —
новый изолированный canonical каталог вне обычных пользовательских app data;
его `data/` нужно создать заранее. Путь `data/imagegen-studio`, runtime environment
и provision report должны отсутствовать. Provisioner отказывается от существующих
назначений, неканонических путей и symlink; он не ремонтирует обычную установку.

```bash
pnpm run app:qualify:provision \
  --app-data '<fresh-root>/data/imagegen-studio' \
  --runtime-id qualification-linux-nvidia-unique \
  --managed-python '<canonical-managed-cpython-3.12.13-root>' \
  --sdxl-config '<canonical-verified-offline-sdxl-config>' \
  --uv '<canonical-absolute-uv-executable>' \
  --report '<fresh-root>/provision-report.json' \
  --activate

pnpm run app:qualify:generation --fixture '<fresh-root>/fixture.json'
```

`fixture.json` содержит `schemaVersion: 1`, тот же абсолютный `appData`, отдельный
`artifacts: '<fresh-root>/native-1'`, `side` и `steps`, а также записи `illustrious`,
`anima`, `encoder`, `vae`, `illustriousLora`, `animaLora`. Каждая запись задаёт
существующий read-only source file через абсолютный `path`, `name`, `family`,
`type`, `sha256` и точный `byteSize`; Illustrious checkpoint также задаёт
`predictionType`. Encoder/VAE должны совпадать с закреплёнными Anima identities.
Harness проверяет source bytes и копирует их в изолированный managed catalog;
это не разрешение писать в исходную model library. Декларированные family и
prediction type — предусловия проверки, а не доказательство их автоматического
определения.

Для повторного прогона с тем же изолированным catalog указать новый
`artifacts: '<fresh-root>/native-2'` в fixture и выполнить:

```bash
pnpm run app:qualify:generation --fixture '<fresh-root>/fixture.json' --resume
```

`--resume` переиспользует только проверенные model files/catalog, а не старый
evidence report. Каждый прогон требует нового canonical evidence destination:
`artifacts/report.json` резервируется эксклюзивно; существующий файл или symlink
отклоняется без изменения прежних данных. Models/artifacts проверяются перед
использованием, а их родители — до создания каталогов. Не удалять прежний report
ради повторного запуска.

Эти scripts не входят в обычный smoke suite и не реализуют release download,
подписанный manifest, offline wheelhouse, repair или rollback. Их наличие и
успешный startup не доказывают успешную trained generation. Фактические результаты
и границы доказательства фиксируются в
[installed runtime qualification research](../engineering/phase-2c-installed-runtime-qualification-research.md).

## Release artifacts

[Trusted transport cache](../engineering/phase-5-runtime-transport-cache-research.md)
accepts two bounded envelopes, an external trusted keyring/app version and an
explicit Main-owned archive URL/redirect-origin policy. A pure gate shared with
the existing transport verifier authenticates both signatures and bindings before
DNS or writes. The same downloader streams exact signed size/SHA; model sources
retain 32 GiB while the separate runtime admission retains the transport's 65 GiB
ceiling. Completed exact-entry containers hold only `transport/`, whose three
files are freshly verified against the selected envelopes before reuse.
Concurrent callers serialize/recheck; a canceled waiter returns without letting
later callers overtake the active writer. Incomplete/corrupt entries refuse and
are preserved, without implicit deletion, overwrite, partial resume or automatic
retry. A new explicit attempt needs a new Main-owned entry path. This finite
consumer does not select shipping URLs/keys, download metadata, manage a catalog
or perform extraction/installation/activation; public Setup remains unavailable.

[Verified local extraction](../engineering/phase-4-runtime-release-extraction-research.md)
authenticates both transport envelopes/archive bytes, preflights exact ZIP
membership, sizes, expansion and modes, then creates only signed regular files
and finally exact relative Python links in an owned new container. Marker and
inner sidecar stay outside `payload/`. All writes use held no-follow parent
fds; the existing `verifyRuntimeRelease` and source/payload snapshot fences run
before durable completion. Cancellation retains incomplete output and never
activates it. This local consumer returns the existing release selection, without
executing Python, downloading or replacing the existing offline assembler.
Shipping keys, download/cache, LaMa and complete public Setup remain separate.

[Signed transport producer](../engineering/phase-4-runtime-release-transport-research.md)
packages the existing exact expanded inventory as `runtime-payload.zip`. A detached
canonical descriptor, signed by an explicitly provided externally trusted
Ed25519 identity, binds the exact ZIP size/hash and unchanged inner envelope and
manifest hashes. The archive contains neither its own descriptor nor signature;
Python symlinks and executable bits are explicit. Signature/envelope validation
is shared with the existing release owner; inner schema and offline assembly are
unchanged. This supplies actual transfer bytes, not installed footprint or total
engine disk peak. The retained complete artifact uses a qualification-only key.
Bounded extraction/download, shipping key delivery, LaMa composition and public
Setup remain separate required consumers; no client accepts arbitrary keys or
URLs from renderer input.

Клиент не должен разрешать произвольные версии зависимостей из публичных package indexes.

Release pipeline формирует и тестирует runtime artifacts для поддерживаемой матрицы:

```text
operating system × architecture × device/runtime profile
```

В первом release проверяется Linux/NVIDIA profile. Возможные будущие AMD, CPU или Metal profiles не являются альтернативными inference engines и не считаются поддержанными без отдельного platform/device port и проверок. `uv.lock` остаётся source of truth для разрешённых версий, а release manifest однозначно связывает app/worker version с Python build, runtime profile и artifact hashes.

Допустимы два способа доставки с одинаковыми гарантиями:

1. готовый relocatable runtime bundle с Python и установленными packages;
2. app-managed Python artifact плюс подписанный wheelhouse, из которого environment собирается локально offline.

Второй вариант не выполняет dependency resolution на машине пользователя. Он устанавливает уже выбранные CI wheels строго из release manifest/lock.

[Build-time wheelhouse plan](../engineering/phase-4-runtime-wheelhouse-plan-research.md)
adapts Invoke's complete lock-closure traversal to base plus `inference`, explicit
Linux/x64 CPython3.12.13 and target glibc. Development groups are excluded; the
editable root is replaced by a verified built worker wheel. The producer emits
exact artifact identities and requirements for the existing runtime contracts.
It does not download or qualify the full wheelhouse, sign a release or select a
supported ABI/driver matrix. The plan binds the explicit Invoke-derived Notebook
exclusion and names its signed dependency policy. Selected-wheel metadata
verification and full installed qualification remain required.

[Wheelhouse verification](../engineering/phase-4-runtime-wheelhouse-verification-research.md)
adds optional producer input `--wheelhouse` for the exact local selected wheel
files. It checks locked hashes/sizes, ZIP contents, filename/version/tags and
actual Core Metadata dependencies through the existing fixed policy. Its
separate `wheelhouse-verification.json` is bound to the newly generated plan's
SHA-256; the original plan flags stay unchanged. A successful verification
report records `artifactBytesVerified: true`, `dependencyEvidence: "wheel-metadata"`
and `installQualified: false`. This gate does not install or execute the wheels,
sign a complete release, supply the other runtime artifacts or establish the
native compatibility matrix. Actual execution evidence remains explicit in the
linked research note.

[Full offline qualification](../engineering/phase-4-runtime-offline-full-research.md)
adds the explicit harness profile `--profile full-inference` with its bound
`--wheelhouse-report`. It exercises the complete selected Python wheel set
through existing Main preview/install/host/assembly/pre-post worker consumers,
then checks reopened-manager state and a small installed CUDA operation probe.
Root's r2 report confirms this finite 67-package installation and native route;
the default two-wheel CPU/refusal profile also passes unchanged. The full fixture
uses an ephemeral signing key and an explicit auxiliary no-op: the review scope
is `python-runtime-slot`, with LaMa, shipping publisher trust, total engine
preview/download and public Setup still separate. The successful native report
does not replace final validation, physical-exit/retention/cleanup receipts or
the release compatibility and readiness gates.

[Signed dependency policy](../engineering/phase-4-runtime-dependency-policy-research.md)
allows only the fixed optional `dependencyPolicy: "invoke-inference-v1"` in a
signed release manifest. It checks installed Core Metadata with root
`imagegen-worker[inference]`, explicit global Notebook exclusion and normal
requirements/markers/version/Python/extras checks. The installed checker runs
after exact distribution membership and worker payload byte verification;
Main validates its bounded receipt before retaining installation provenance.
Other dependency failures refuse and retain the incomplete slot. Absent policy
preserves ordinary strict `uv pip check` and the existing base CPU path.
This additive schema1 field is understood by the new reader; an older exact-key
reader rejects manifests containing it. It does not establish the final
release/protocol compatibility matrix, complete wheelhouse or public Setup.

Production installation должна:

- предпочитать wheels и не собирать `sdist` на машине пользователя;
- проверять размеры, cryptographic hashes и подпись/доверие release manifest;
- не зависеть от текущего состояния PyPI;
- не использовать editable installs;
- не добавлять undeclared packages;
- сериализовать runtime install/repair operations app-level lock'ом;
- заранее проверять доступное место;
- сохранять безопасно переиспользуемый download cache отдельно от environment.

Packaging spike должен подтвердить relocatability полного bundle на каждой платформе. Если готовый environment нельзя надёжно переносить, используется offline assembly в конечном app-owned пути из managed Python + wheelhouse.

## Staged install lifecycle

### 1. Prepare

- main process выбирает runtime profile по OS/architecture/device;
- получает release manifest;
- проверяет совместимость app, worker protocol и Python ABI;
- проверяет свободное место;
- получает exclusive runtime-operation lock.

### 2. Download and verify

- artifacts скачиваются во временный/cache path;
- недокачанный файл никогда не считается установленным;
- до распаковки проверяются expected size и hash;
- файлы из непроверенного manifest не исполняются.

### 3. Build staging runtime

- для offline assembly создаётся новый versioned environment сразу по его
  финальному абсолютному пути `{runtime-id}/`, но с маркером незавершённой
  установки и без ссылки из `current-runtime.json`; перенос готового `venv`
  из `.staging` в другой путь не предполагается;
- готовый bundle можно распаковать во временный каталог и переместить только
  после проверки relocatability полного Python environment для данного profile;
- используется только app-managed Python;
- locked packages устанавливаются из проверенных artifacts;
- активный environment остаётся нетронутым.

### 4. Self-test

Минимальный gate перед активацией:

- dependency consistency check;
- импорт собственного worker package;
- импорт PyTorch, Diffusers, Transformers и обязательных native extensions;
- проверка Invoke-like pipeline и выбранного device/runtime profile (Linux/NVIDIA для первого release);
- небольшой tensor/device smoke test;
- запуск worker subprocess;
- handshake с worker version и protocol version;
- worker self-test/capabilities response;
- отсутствие неожиданного обращения к системному Python или глобальным packages.

Полный inference smoke test может быть отдельным release/diagnostic gate, если для него нужна модель. Базовый runtime self-test не должен требовать скачивания пользовательского checkpoint.

Отдельный release/integration gate прогоняет реальные Illustrious и Anima jobs с
совместимыми LoRA, включая обещанные generation modes и regional inputs.
В частности, Anima regional negative text требует проверенной spatial
semantics; успешный import и базовый tensor self-test этого не доказывают.
Обязательные Anima Qwen3 encoder и VAE — model-library dependencies, а не
Python environment packages: main process показывает полный размер набора до
загрузки и управляет files, worker проверяет их exact installed identities при
запуске job.

### 5. Activate

- worker старой версии корректно останавливается;
- проверенный environment уже находится по финальному versioned пути; маркер
  незавершённой установки снимается перед публикацией pointer;
- `current-runtime.json` атомарно заменяется через temp file + rename;
- main process запускает worker по сохранённому абсолютному пути;
- предыдущий runtime сохраняется до подтверждения успешного запуска новой версии.

### 6. Roll back and collect

- если новый worker не проходит post-activation startup, pointer возвращается к previous known-good runtime;
- неуспешный runtime не активируется повторно без нового repair/install attempt;
- garbage collection удаляет старые environments только после успешной эксплуатации нового;
- минимум один previous known-good runtime сохраняется, пока позволяет disk policy.

На Windows pointer-файл предпочтительнее обязательного symlink/junction: он не требует специальных прав и одинаково работает во всех install modes.

## Repair semantics

[Manifest host preflight](../engineering/phase-4-runtime-host-preflight-research.md)
is the default internal Main prerequisite for Install/Repair before auxiliary
work and new slot creation. It checks Linux/x64, runtime glibc and every reported
NVIDIA device against the signed driver minimum and exact SM allowlist. Until
device identity is explicitly bound to the worker, an unsupported reported GPU
refuses this conservative path. No CPU fallback or device picker is added.
Cancellation waits for the existing owned-command executor to confirm exit;
unknown exit blocks new image work and successful shutdown confirmation.
This metadata preflight neither chooses qualified release floors nor replaces
the installed CUDA self-tests. Public setup remains unavailable without the
complete trusted release/preview/download integration.

`Repair Runtime` означает rebuild/replace, а не изменение активного environment:

1. повторно проверить или загрузить exact artifacts;
2. создать новое staging environment;
3. выполнить полный self-test;
4. активировать его как новую known-good установку;
5. удалить повреждённую копию только после успешного переключения.

Очистка uv cache и повторная загрузка artifacts могут быть частью расширенной диагностики, но cache никогда не является source of truth для активного runtime.

## Extension and plugin boundary

Стороннему коду запрещено автоматически выполнять `pip install` в основной worker environment.

Произвольная plugin dependency способна заменить PyTorch, NumPy, Diffusers или другую общую библиотеку и снова сделать runtime невоспроизводимым. Если Python extensions появятся позже, для них потребуется отдельное решение:

- изолированный subprocess/environment и стабильный protocol;
- либо ограниченный SDK без произвольных dependencies;
- либо проверенные app release bundles.

Plugin API не входит в MVP. До принятия отдельного architecture decision основной runtime остаётся закрытым и exact-synced.

## Системные зависимости и границы гарантии

App-owned runtime устраняет зависимость от системного Python, но не может заменить:

- GPU driver;
- поддерживаемую версию ОС и kernel/runtime ABI;
- доступное место и filesystem permissions;
- аппаратную поддержку выбранного device/runtime profile;
- вмешательство antivirus/security software.

Эти условия проверяются отдельно и дают понятную diagnostic error. Они не являются поводом изменять активный environment или пробовать случайный системный Python.

Гарантия ImageGen Studio формулируется так: внешняя несовместимость или ошибка установки может сделать новый runtime недоступным, но не должна повредить предыдущий known-good runtime, модели или проекты пользователя.

## Ownership

Electron main process владеет:

- выбором runtime profile;
- download/verification lifecycle;
- install operation lock;
- staging/activation/rollback;
- запуском worker по абсолютному пути;
- health/self-test normalization;
- cleanup policy и диагностическими логами.

Python worker не обновляет сам себя. Renderer не запускает `uv`, Python или shell commands напрямую и получает только доменные status/progress/error DTO через typed preload API.

### CPU derivatives из установленного runtime

Main использует общий provider для previews, image import, target inspection и
определения режима в settings comparison. В production
`RuntimeManager.resolveInstalledProjectWorker(scratch)` читает активный app-owned
pointer, проверяет interpreter и canonical runtime/cache/scratch paths и возвращает
location с отдельным offline environment и `CUDA_VISIBLE_DEVICES=''`.
Development adapter допускается только в явном development/test режиме.
CPU здесь выполняет image operations; поддерживаемый inference profile остаётся
Linux/NVIDIA.

Provider не запускает worker и не владеет его transport: общий
`ProjectTargetInspectionOwner` сериализует CPU actions/reads, передаёт startup
abort signal и ждёт confirmed exit. GPU generation сохраняет отдельный runtime
lease. CPU операции могут выполняться рядом с running inference того же runtime,
без CUDA qualification и зависимости от исправного ML config. Unsafe/missing
pointer, смена runtime при активном lease, незавершённый startup, unconfirmed exit
и shutdown отклоняют новое разрешение/запуск.

Failed startup и failed `close()` уже запущенного CPU child входят в общий
physical-exit registry `ProjectWorkerClient`. Его наблюдают runtime status,
installed provider, qualification/admission и фактические CPU/CUDA spawn boundaries,
включая повторные проверки после asynchronous path/cache reads. Fence снимается
только после подтверждённого OS exit или успешного explicit retry. Завершившийся
Save/import сохраняет успешный результат; следующий placeholder Save не запускает
новый child, пока прежний exit не подтверждён. Shutdown повторяет закрытие retained
child до закрытия storage. Старые failed-start query/retry names — aliases общего
fence, а не отдельная более узкая проверка.

Если derivatives недоступны, Save сохраняет проект с documented placeholder
preview. Повреждённый ML runtime не препятствует этой операции. Shutdown закрывает
CPU owner до закрытия SQLite; startup, начатый после разрешения location, остаётся
в его abort/exit barrier. Эта проводка не устанавливает trust полного release
artifact: integrity/signature, staged install и rollback сохраняют свои отдельные
release gates.

### Idle queue и GPU dispatch

`GenerationDispatchCoordinator` перед GPU qualification/reservation запрашивает
metadata-only `hasDispatchablePending()`. Preflight ждёт enqueue publication
barrier, проверяет queue/staging readiness, исключает fenced Projects и работу
при существующей global running row; fence/readiness повторно проверяются после
SQLite read. Пустая или полностью fenced очередь возвращает idle без нового CUDA
child и не блокирует здоровые CPU derivatives.

Это advisory read: frozen-input validation, verified claim и cross-instance
SQLite CAS остаются окончательной authority. Если положительный preflight устарел
из-за cancellation или чужого claim, он не даёт права выполнить job. Shutdown
после await запрещает новый lease; существующий drain re-wake не теряет admission
между idle и detach. Успешные controlled subprocess/SQLite tests и behavioral
mutations проверяют эти границы отдельно от trained generation и release installer.

### Advisory status при штатном закрытии

Если текущий generation lease уже подтвердил qualified handshake и Main явно
закрывает этот здоровый child, совпадающие pointer/config сохраняют advisory
`ready` с отложенным отдельным probe до окончания close. Штатное завершение не
показывается как необходимость Repair. Это не разрешает новый lease, выдачу
transport/metadata или второй CUDA child до физически подтверждённого выхода.
Ранее сломанный child, изменённые metadata и global exit fences остаются
недоступными; отказ close сразу сохраняет `unconfirmed-exit` до explicit retry.
Оба инициатора close и отказные соседи проверены actual-child regressions в
[Smart Patch installed qualification](../engineering/phase-4-smart-patch-installed-generation-research.md).

## Historical app data and incompatible protocol checkpoint

[Historical29→30](../engineering/phase-5-application-state-upgrade-research.md)
qualifies the existing startup migration owner and Project Save/reopen across two
current packaged lifetimes with a deliberately incompatible Node JSONL peer.
Actual default runtime/client transports refuse it and settle all nine children;
Projects remain saveable with their empty placeholder preview. This is protocol
refusal evidence, not an installed historical CPython/worker or ML runtime test.
The retained data-only checkpoint is not an activatable relocated runtime, and no
Repair/Install provider or readiness status is promoted.

The stock AppImage follow-up used the signed slot's actual installed Python and
worker with a single isolated protocol `2` file. On a fresh profile and a DB29
upgrade, the app offered Repair and refused Generate. The historical Retry
preserved the canceled row and frozen files. Explicit Save retained the
edited prompt and the historical Raster under an unavailable preview, then
reopened the same package. [Installed worker evidence](../engineering/phase-5-packaged-installed-engine-research.md#stock-appimage-with-an-incompatible-installed-worker)

### Application database backup

[Startup SQLite backup](../engineering/phase-5-database-migration-backup-research.md)
is a separate storage boundary before services start: a pending existing DB gets
an awaited online backup, including committed WAL, before migrations. Failure
stops startup with manual recovery guidance. This neither backs up nor activates,
repairs or rolls back the Python runtime. Restoring SQLite alone does not rewind
resource/model files, Project packages or installed worker environments.

## Acceptance criteria

- Приложение запускает worker без установленного системного Python.
- Worker никогда не выбирается через пользовательский `PATH`.
- Одинаковый release/runtime profile использует зафиксированные Python и package versions.
- Failed download, unpack, dependency install или self-test оставляет текущий worker работоспособным.
- Runtime update и Python update не меняют активное окружение на месте.
- После неудачного post-activation startup выполняется rollback на previous known-good runtime.
- `Repair Runtime` создаёт новое окружение вместо последовательного ремонта текущего.
- Удаление runtime/cache не удаляет models, projects или presets.
- Production client не собирает Python packages из `sdist` и не разрешает зависимости из публичных indexes.
- Arbitrary plugin dependencies не устанавливаются в основной worker environment.
- Первый release artifact и worker self-test покрывают Linux/NVIDIA profile;
  неподдерживаемая OS/device combination не запускает альтернативный inference
  engine и даёт понятную диагностику до установки.
- Setup/repair работает через основное окно без отдельного launcher app/window;
  при отсутствующем worker окно остаётся доступным для диагностики.
- Release/integration checks проверяют реальные Illustrious и Anima generation
  jobs с LoRA и обещанными regional inputs. Anima regional negative text нельзя
  объявлять рабочим без подтверждённой пространственной семантики.
- Logs позволяют определить runtime id, Python version, worker/protocol version, device/runtime profile и этап отказа без показа внутренних терминов в основном пользовательском UI.
