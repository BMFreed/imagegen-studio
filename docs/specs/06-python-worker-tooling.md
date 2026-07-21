# Python Worker Tooling

## Решение

Python worker должен быть typed и linted с самого начала, но без попытки сделать внешние ML-библиотеки полностью статически прозрачными.

Dependency и environment management выполняются только через `uv`: `pyproject.toml` описывает проект, `uv.lock` фиксирует версии, локальный `.venv` используется для разработки. Poetry и ручное управление постоянными зависимостями через `pip install` не используются. Production runtime lifecycle, собственный CPython, staged installation и rollback описаны отдельно в [Python Runtime And Dependency Management](./07-python-runtime-management.md).

Основной набор инструментов:

- **BasedPyright** — основной type checker и language server для Python worker'а.
- **Ruff** — formatter и linter.
- **ty** — перспективный инструмент, который можно запускать экспериментально, но не делать обязательным CI gate в MVP.
- **mypy** — не является baseline-инструментом MVP; к нему можно вернуться только при конкретной причине.

## Граница строгости

Strict typing применяется к коду, который принадлежит ImageGen Studio:

- worker protocol DTO;
- validation/parsing generation jobs;
- model metadata и compatibility metadata;
- worker lifecycle;
- progress/error/result messages;
- cache handles и application-level inference adapters.

Diffusers, PyTorch, Transformers и похожие библиотеки остаются за тонким adapter-слоем. Внутри такого слоя допустимы `Any`, `cast(...)` и локальные suppressions, если они изолируют динамический API внешней библиотеки и не протекают в остальной worker-код.

Правило:

```text
our domain/worker code = strict and explicit
diffusers_runtime adapter = pragmatic typed boundary
external ML internals = do not stub unless there is a concrete pain
```

## Ruff

Ruff используется и как formatter, и как linter.

Стартовый набор правил:

```toml
[tool.ruff]
target-version = "py312"
line-length = 100
src = ["src", "tests"]

[tool.ruff.lint]
select = ["E", "F", "I", "UP", "B", "SIM"]

[tool.ruff.format]
quote-style = "double"
indent-style = "space"
line-ending = "lf"
```

На старте не включаем шумные наборы правил вроде `D`, `ANN`, `PL` и `S` для всего worker'а. Их можно добавлять позже точечно, если они дают пользу без большого количества ложных или механических правок.

## BasedPyright

BasedPyright является основным источником type diagnostics для Python worker'а.

Предпочтительный подход:

- включить строгую проверку для собственных worker modules;
- ослабить правила только для adapter-файлов, которые напрямую общаются с Diffusers/PyTorch;
- не писать stub-файлы для Diffusers/PyTorch заранее;
- использовать `Protocol`, `TypedDict`, dataclasses или Pydantic/Valibot-like validation на границах, если это делает контракт понятнее;
- держать `Any` локальным и не возвращать его из domain-facing API.

## Команды

После появления `worker-python/` минимальные локальные проверки запускаются внутри locked uv environment:

```bash
cd worker-python
uv sync --locked
uv run ruff format src tests
uv run ruff check src tests
uv run basedpyright src tests
```

Для CI formatter должен запускаться в check-режиме:

```bash
cd worker-python
uv sync --locked
uv run ruff format --check src tests
uv run ruff check src tests
uv run basedpyright src tests
```

CI не устанавливает undeclared dependencies вручную. Изменение постоянной зависимости проходит через `uv add` / `uv remove`, обновляет `uv.lock` и проверяется тем же locked environment, который используется для сборки release runtime artifacts.

## Связь с inference policy

Tooling не должен подталкивать проект к переписыванию inference-механизмов ради чистоты типов.

Если Diffusers API динамический, мы изолируем динамику в adapter-слое. Базовое поведение worker'а остаётся InvokeAI-like: использовать зрелый Diffusers/PyTorch runtime и адаптировать его под доменную модель ImageGen Studio.
