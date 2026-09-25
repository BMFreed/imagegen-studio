# Python Runtime And Dependency Management

## Решение

ImageGen Studio не использует системный Python и не изменяет активное Python-окружение при установке или обновлении worker'а.

Первый release target — Linux с NVIDIA GPU. Один Invoke-like inference pipeline
поддерживает Illustrious/SDXL и Anima с LoRA; альтернативных inference engines,
включая отдельный ComfyUI backend, нет. Diffusers/PyTorch — внутренние
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
`/home/user/Work/sources/launcher/`, проверенный `main` —
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
│  │  ├─ {worker-version}-{runtime-profile}/
│  │  ├─ {previous-worker-version}-{runtime-profile}/
│  │  └─ {next-worker-version}-{runtime-profile}.staging/
│  └─ current-runtime.json
├─ cache/
│  ├─ uv/
│  └─ runtime-downloads/
└─ logs/
   └─ worker/
```

`current-runtime.json` содержит identity активного runtime и абсолютный путь к его Python executable. Для переключения не требуется активировать `venv`, изменять глобальный `PATH` или использовать shell startup scripts.

Runtime, модели и пользовательские проекты имеют разные lifecycle:

- runtime можно пересоздать без удаления моделей;
- uv/download cache можно безопасно очистить без повреждения активного runtime;
- checkpoints, LoRA, VAE и embeddings не входят в Python environment;
- `.igs` и workspaces не зависят от расположения runtime.

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

## Release artifacts

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

- создаётся новый `{runtime-id}.staging`;
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
- staging получает финальную versioned identity;
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
