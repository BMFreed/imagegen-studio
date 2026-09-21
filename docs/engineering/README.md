# Engineering Workflow

Продуктовые обещания задают ожидаемый результат, supporting contracts — точные
границы, а research и review связывают их с реализацией и доказательствами.

- [Product Promises](../product-promises.md) — обязательства и публичная готовность.
- [Research protocol](./research-protocol.md) — исследование до изменения по риску.
- [Review protocol](./review-protocol.md) — проверка результата и регрессий.

## Источник и адаптация

Подход изучен по локальному репозиторию work project (`work-project`):

- `docs/product-capabilities/capability-rules.md`;
- `docs/product-capabilities/promise-matrix.md`;
- `architecture/standards/research-protocol.md`;
- `architecture/standards/review-protocol.md`;
- `.claude/commands/mr-review.md`.

Это reference paths другого репозитория, не зависимости checkout ImageGen Studio.
Адаптация принята 2026-09-07. Канонические инструкции этого проекта находятся
в двух локальных protocols выше; установка work project tooling для них не нужна.

Сохранены risk tiers, promise-first review, проверка causal evidence, реальных
entry points, отказных сценариев, red→green regression и чувствительности тестов.
GitLab refs/API, shared stand, service deployment, changesets и обязательные
reviewer commits заменены правилами для GitHub и локального Vue playground.
Сам факт зелёного теста не доказывает корректность произвольной реализации.

## Пилоты и дальнейшая автоматизация

Protocols и указатели в AGENTS.md действуют сейчас. Пилоты ниже ещё не выполнены;
они привязаны к реализации соответствующих boundaries и не делают promises
публично готовыми.

| Пилот | Что проверить | Критерий завершения |
| --- | --- | --- |
| PP-007 Save/recovery research | `.igs` loader/save, atomic replacement, dirty/shadow state при отказе | Исследование и production filesystem tests: старый файл читается после отказа, recovery сохраняется, успех проверен повторным открытием |
| PP-006 Project Apply review | Integrated missing-resource diagnostic, nested refs, section selection, source preset | Reproduction и red tests на реальном Project entry point; fix делает их зелёными без ослабления assertions, невыбранные секции и source preset неизменны |

Первый пилот начинается вместе с production Save/recovery slice. Второй — при
первом исправлении [известных PP-006 gaps](../features/presets.md#known-pp-006-prototype-gaps).
После пилотов уточнить инструкции по фактическим затруднениям и только затем
создать собственный `.codex/skills/promise-review/SKILL.md`.

Skill пока не создан. Будущий skill должен фиксировать base/head или явно
проверяемый working tree, читать локальные protocols, поддерживать GitHub/local
branch review, запускать существующие проверки и выдавать evidence report.
Он не должен автоматически коммитить, публиковать review, менять чужую ветку
или требовать отсутствующий work project stand. `.claude/commands/mr-review.md`
служит примером организации процесса, а не готовым к переносу skill.
