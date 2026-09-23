# PP-006 Project Apply: baseline прототипа

Измерение: 2026-09-23—24 (МСК); кодовый снимок — `master` на
`f57915897c6c0a3494f096843de15c58310022a1`. До проверки рабочее дерево
было чистым. Цель этого baseline — узнать, что уже наблюдается через Project UI
и ловит ли существующий тест одну правдоподобную ошибку выбора секций. Это не
формальный пилот будущего `Open in Models` handoff и не сравнение методик.

## Граница и критерий

- **Реальная граница:** Chromium → Vue Project picker → Apply modal → mock
  Project state. Выбор и действие пользователя выполняются через браузер.
- **Наблюдаемый инвариант:** недостающая LoRA в выбранной секции блокирует
  `Apply`; снятие выбора только с этой секции разрешает Apply, копирует Prompt
  и оставляет текущую LoRA проекта без изменений.
- **Соседний контроль:** та же заявка на Apply с выбранной секцией LoRA остаётся
  заблокированной; меняется только выбор секции.
- **Осмысленная поломка:** проверять missing resources во всех секциях пресета,
  включая снятую LoRA, вместо только выбранных.

Инвариант проходит через [Project picker](../prototype-app/src/prototypes/project/ProjectPresetCard.vue),
[Apply modal](../prototype-app/src/prototypes/presets/ApplyPresetModal.vue) и
[применение секций](../prototype-app/src/prototypes/project/project.utils.ts).
Его браузерное утверждение находится в
[project-audit.spec.ts](../prototype-app/tests/project-audit.spec.ts).

## Исполнение

| Проверка                                        | Наблюдение                                                            |
| ----------------------------------------------- | --------------------------------------------------------------------- |
| `pnpm run typecheck`                            | Exit 0                                                                |
| `pnpm run prototype:test`                       | 139 passed, 0 failed, 0 skipped; Playwright сообщил 1.8 min           |
| Focused Project Apply на исходном коде          | 1 passed                                                              |
| Focused Project Apply с mutation                | 1 failed на `toBeEnabled()` после снятия выбора LoRA, как и ожидалось |
| Focused Project Apply после восстановления кода | 1 passed                                                              |

Mutation выполнена во временном detached worktree на том же commit: в
`ApplyPresetModal.vue` условие `applyDisabled` временно использовало
`sections.value.some(...)` вместо `draft.value.selectedSections.some(...)`.
Падение произошло в [assertion после deselect](../prototype-app/tests/project-audit.spec.ts),
а не на сборке, импорте или случайном таймауте. Изменение удалено вместе с
worktree. Это доказывает чувствительность **одного теста к одной ошибке**, а не
полноту PP-006.

Для выборочного прогона использована команда:

```sh
CI=true pnpm run prototype:test docs/prototype-app/tests/project-audit.spec.ts --grep 'integrated Apply explains missing resources' --workers=1
```

Старая рекомендация `pnpm run prototype:test -- ...` передала буквальный `--`
в Playwright и вместо одного теста запустила все 139. Лишний прогон был
прерван (`exit 130`, 52 passed, 8 interrupted, 79 did not run) и в результат
выше не включён. [Review protocol](./review-protocol.md) исправлен; `--list`
для новой команды показал ровно один тест. При настройке временного worktree
pnpm пересоздал общие `node_modules`; зависимости восстановлены через
`CI=true pnpm install --frozen-lockfile`. Поэтому наблюдавшееся время не является
замером стоимости методики. Сырые логи прогонов не сохранены отдельным
артефактом; отчёт содержит команду, ревизию, итог и точку ожидаемого падения.

## Пробелы перед следующим пилотом

- [Контракт пресетов](../features/presets.md#known-pp-006-prototype-gaps)
  требовал Project Playwright evidence и для missing embedding внутри Prompt.
  Найденный интегрированный тест проверяет LoRA; поведение embedding этим
  baseline не подтверждено. Формулировка контракта исправлена.
- `Open in Models` отсутствует в интегрированной Apply modal. На отдельном
  демонстрационном экране и в Preset Manager кнопка пока без интерактивного
  handoff; этот известный gap остаётся предметом PP-006 review pilot.
- Прототип хранит preset и Project в памяти. Прогон не проверяет доступность
  реального ресурса, SQLite/`.igs`, восстановление после отказа или worker.
- Время разработки, количество доработок после независимого review и
  сравнительный результат Spec Kitty этим ретроспективным baseline не измерены.

Для следующего пилота нужно записать критерии `Open in Models` до изменения
кода и сохранить red→green, независимый review, фактические затраты и
непокрытые пункты. Production Save/recovery измеряется отдельно по
[PP-007 плану](./README.md#пилоты-и-дальнейшая-автоматизация) с настоящими
файлами.
