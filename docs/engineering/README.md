# Engineering Workflow

Продуктовые обещания задают ожидаемый результат, supporting contracts — точные
границы, а research и review связывают их с реализацией и доказательствами.

- [Product Promises](../product-promises.md) — обязательства и публичная готовность.
- [Research protocol](./research-protocol.md) — исследование до изменения по риску.
- [Review protocol](./review-protocol.md) — проверка результата и регрессий.
- [Confirmed early Raster Add](./phase-2b-early-raster-acceptance.md) — exact candidate/job confirmation, scoped cancellation, confirmed worker exit and preserved journal/shadow/Save boundary; qualified batch grouping follows in a separate internal checkpoint.
- [Qualified batch grouping](./phase-2b-batch-grouping-research.md) — atomic queue publication, shared staging session, escaped-manifest capacity and early Add integration; renderer Generate and release runtime remain open.
- [Prepared batch planning and capacity](./phase-2b-batch-planning-research.md) — bounded concrete prompt/seed planning, shared request qualification, optional seed behavior in immutable provenance and reproducible persistent-storage measurements; Generate UI remains separate.
- [Persisted dynamic settings and prompt preview](./phase-2b-dynamic-preview-research.md) — production toolbar/modal, shared bounded planner, typed draft IPC and real history/shadow/portable Save evidence; preview uses one iteration and does not start inference.
- [Product audit fixes](./product-audit-fixes.md) — actual seed при Add, принадлежность вкладок прототипа, размер файла до install и актуальное описание native acceptance; выполненные red/green и границы evidence.
- [InvokeAI staging/canvas reference](./invoke-recovery-canvas-reference.md) — проверенные исходники и границы адаптации recovery, queue и бесконечного Canvas.
- [Shared UI component contracts](./ui-component-contracts.md) — повторяемые компоненты Electron/прототипа, их владельцы, API и browser checks.
- [UI audit skill](../../.codex/skills/ui-audit/SKILL.md) — локальная проверка вёрстки и базовых правил дизайна по скриншотам и live UI; аудит завершается отчётом, исправления выполняются по запросу. [Чек-лист](../../.codex/skills/ui-audit/references/visual-checklist.md) содержит основания и исключения, [runtime guide](../../.codex/skills/ui-audit/references/runtime.md) — запуск Electron с временной библиотекой и входы в Vue-прототип.
- [Desktop UI layout review](./desktop-ui-layout-review.md) — Home, Model Manager, общий редактор размера и карта оставшейся production-реализации.
- [UI kit experiment](./ui-kit-experiment.md) — завершённый замер 18 реализаций: прямой Naive, общий API поверх Naive и Vue/HTML; первые и финальные версии, стоимость подготовки и границы вывода.
- [UI context experiment](./ui-context-experiment.md) — завершённый пилот на 24
  изолированных агентах: влияние справок об API и композиции, результаты и ограничения.
- [PP-006 prototype baseline](./pp-006-prototype-baseline.md) — проверенный на mocks Project Apply flow, red/green semantic mutation и границы evidence перед следующим пилотом.

## Источник и адаптация

Подход изучен по локальному репозиторию work project (`work-project`):

- `docs/product-capabilities/capability-rules.md`;
- `docs/product-capabilities/promise-matrix.md`;
- `architecture/standards/research-protocol.md`;
- `architecture/standards/review-protocol.md`;
- `architecture/adr/042-three-test-levels-and-lighter-system-layer.md`;
- `architecture/standards/test-quality/layer-choice.md`;
- `architecture/standards/test-quality/substitutions.md`;
- `architecture/standards/test-quality/test-health.md`;
- `tools/e2e/tests/sample/resource-management.spec.ts`;
- `.claude/commands/mr-review.md`.

Это reference paths другого репозитория, не зависимости checkout ImageGen Studio.
Адаптация принята 2026-09-07. Канонические инструкции этого проекта находятся
в двух локальных protocols выше; установка work project tooling для них не нужна.

Сохранены risk tiers, promise-first review, проверка causal evidence, реальных
entry points, отказных сценариев, red→green regression и чувствительности тестов.
GitLab refs/API, shared stand, service deployment, changesets и обязательные
reviewer commits заменены правилами для GitHub и локального Vue playground.
Сам факт зелёного теста не доказывает корректность произвольной реализации.
Правила выбора уровня, проверки полноты перечней и async-свидетеля сверены с
work project `dev` на `<private revision>` (2026-09-23).
Специфичный для work project harness и его большой CI-gate подмен не переносились.

## Пилоты и дальнейшая автоматизация

Protocols и указатели в AGENTS.md действуют сейчас. Пилоты ниже ещё не выполнены;
они привязаны к реализации соответствующих boundaries и не делают promises
публично готовыми.

| Пилот                         | Что проверить                                                                                               | Критерий завершения                                                                                                                     |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| PP-007 Save/recovery research | `.igs` loader/save, atomic replacement, dirty/shadow state при отказе                                       | Исследование и production filesystem tests: старый файл читается после отказа, recovery сохраняется, успех проверен повторным открытием |
| PP-006 Apply handoff review   | `Open in Models` для missing resource и возврат к Apply; позднее — настоящие resource/SQLite/`.igs` команды | Red→green через Project picker; selected sections, current Project и source preset проверены; evidence прототипа и production разделены |

Первый пилот начинается вместе с production Save/recovery slice. Второй — при
реализации [оставшегося `Open in Models` gap](../features/presets.md#known-pp-006-prototype-gaps).
Project Apply diagnostics и regression coverage через picker уже есть на mocks;
формальным пилотом review они не отмечены.

Сбор данных для оценки методики начинается **до и во время** реализации, а не
задним числом после готового приложения. Сейчас можно зафиксировать acceptance
criteria, явные gaps и baseline прототипного flow: UI-поведение, время работы,
доработки после review и чувствительность браузерных тестов к ошибкам. Это не
проверяет Save, recovery или worker.

Для PP-007 до реализации writer/loader записать инвариант
отказа, успешный соседний сценарий и mutation, которую будущий тест обязан
поймать: interrupted Save оставляет прежний `.igs` читаемым, shadow сохранным,
Project dirty; успешный Save открывает новую ревизию; преждевременный `Saved`
до замены файла должен делать соответствующий тест красным. С появлением реальной
границы сохранить SHA, executed/failed/skipped, исход mutation, найденные
дефекты и время/доработки; итоговый вывод сделать после рабочего среза и
независимой проверки. Число зелёных тестов прототипа не измеряет надёжность
production `.igs`. Один пилот показывает применимость и стоимость процесса;
для сравнительного вывода нужны сопоставимые задачи и одинаковая независимая
оценка.

Пилот Spec Kitty планируется на ограниченном многоагентном production-срезе
в отдельном worktree с зафиксированной версией инструмента. До начала работы
закрепить тот же продуктовый контракт, критерии приёмки, тестовую среду и
независимую оценку, что применялись бы без него. Записать связи требований с
результатами, пропущенные handoff, доработки после review, время и объём
служебных артефактов. Одна миссия даст данные о применимости и накладных
расходах; сравнительный вывод требует нескольких сопоставимых задач с
одинаковыми правилами оценки. Продуктовые контракты остаются в `docs/features`
и `docs/product-promises.md`, а артефакты Spec Kitty ссылаются на них.

После пилотов уточнить инструкции по фактическим затруднениям и только затем
создать собственный `.codex/skills/promise-review/SKILL.md`.

Skill пока не создан. Будущий skill должен фиксировать base/head или явно
проверяемый working tree, читать локальные protocols, поддерживать GitHub/local
branch review, запускать существующие проверки и выдавать evidence report.
Он не должен автоматически коммитить, публиковать review, менять чужую ветку
или требовать отсутствующий work project stand. `.claude/commands/mr-review.md`
служит примером организации процесса, а не готовым к переносу skill.
