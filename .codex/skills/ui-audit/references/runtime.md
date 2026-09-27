# Подключение к интерфейсу ImageGen Studio

Все команды ниже выполняются из корня checkout. Используй существующие зависимости
из [package.json](../../../../package.json); не устанавливай другой Playwright или
внешний skill ради этой проверки. Этот путь работает через обычный Node/exec,
не требует `js_repl`. При доступной интерактивной сессии можно сохранить те же
handles между действиями. Проверка по исходникам не заменяет просмотр PNG.

## Electron: реализованный интерфейс

Перед проверкой обнови сборку: `pnpm run app:build`. Для запуска нужен графический
сеанс Linux; если он недоступен, явно сообщи ограничение или используй уже
настроенный virtual display, обозначив отличие от пользовательского окружения.
Не подключай тест к пользовательской библиотеке по умолчанию.

Ниже стартовый пример для временного `.mjs` вне репозитория. Запусти его
`node /absolute/path/to/audit.mjs` из корня checkout. Он открывает Home и Model
Manager на пустой библиотеке, сохраняет изображения и закрывает только свой процесс.
Для другого элемента замени блок действий обычной навигацией UI. Не копируй
весь smoke-сценарий с установками и filesystem операциями ради просмотра модалки.

```javascript
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'

const require = createRequire(path.join(process.cwd(), 'package.json'))
const { _electron, expect } = require('@playwright/test')
const root = await mkdtemp(path.join(os.tmpdir(), 'igs-ui-audit-'))
const evidence = path.join(root, 'evidence')
await mkdir(evidence)
const env = {
  ...process.env,
  NODE_ENV: 'test',
  XDG_CONFIG_HOME: path.join(root, 'config'),
  XDG_DATA_HOME: path.join(root, 'data'),
  XDG_CACHE_HOME: path.join(root, 'cache'),
}
delete env.ELECTRON_RUN_AS_NODE
delete env.IMAGEGEN_DEV_SERVER_URL
delete env.IMAGEGEN_TEST_IMAGE_WORKER
console.log(`Audit artifacts: ${root}`)

let application
try {
  application = await _electron.launch({ args: ['.'], cwd: process.cwd(), env })
  const page = await application.firstWindow()
  await expect(page.getByRole('region', { name: 'Home', exact: true })).toBeVisible()
  await expect(page.getByText('No projects yet', { exact: true })).toBeVisible()
  await page.evaluate(() => document.fonts.ready.then(() => undefined))
  await writeFile(
    path.join(evidence, 'viewport.json'),
    JSON.stringify(
      {
        url: page.url(),
        ...(await page.evaluate(() => ({
          width: innerWidth,
          height: innerHeight,
          dpr: devicePixelRatio,
        }))),
      },
      null,
      2,
    ),
  )
  await page.screenshot({ path: path.join(evidence, 'home.png') })

  await page.getByRole('button', { name: 'Manage Models', exact: true }).click()
  const manager = page.getByRole('dialog', { name: 'Model Manager', exact: true })
  await expect(manager).toBeVisible()
  await expect.poll(() => manager.evaluate((el) => getComputedStyle(el).transform)).toBe('none')
  // Baseline view: move away from controls before comparing with a hover state.
  await page.mouse.move(0, 0)
  await page.screenshot({ path: path.join(evidence, 'models.png') })
} finally {
  await application?.close()
}
```

Открой полученные PNG инструментом просмотра изображений. Полный viewport даёт
контекст, отдельный screenshot локатора — детали; full-page capture может скрыть
проблему доступности содержимого в исходном окне. Координаты DOM заданы в CSS px;
при измерениях по PNG учитывай сохранённый DPR. Для canvas также смотри пиксели:
его содержимое не описывается полностью DOM/accessibility tree.

По завершении закрой запущенные тобой процессы. Артефакты сохраняй до передачи
результата; удалять можно только созданный этим запуском временный каталог.
Обычный `pnpm run app:dev` без изоляции использует рабочие данные — это не замена
этому примеру. Для сценария с существующим проектом используй временную копию.

## Навигация и состояния

- Production: селекторы и fixtures находятся в
  [smoke-desktop.mjs](../../../../scripts/smoke-desktop.mjs). Базовый Home →
  `Manage Models` → dialog `Model Manager`; `New Project` встречается дважды —
  ограничивай locator нужной областью. Не выбирай произвольную `.first()`.
- Геометрия: [desktop-layout-checks.mjs](../../../../scripts/desktop-layout-checks.mjs)
  показывает измерения, ожидание конца анимации и resize через `BrowserWindow`.
  Эти assertions покрывают известные инварианты, не находят все визуальные дефекты.
- Минимум native window задан в [main/index.ts](../../../../src/main/index.ts)
  (`minWidth`/`minHeight`); на момент создания инструкции — 900×620. Сверяй с кодом.
  Изменяй окно через Electron, затем проверяй реальные `innerWidth`/`innerHeight`:
  `page.setViewportSize()` не проверяет поведение native window.
- Fixture с моделями не доказывает inference. При аудите не запускай загрузки,
  runtime installation или удаление пользовательских данных ради проверки вёрстки.

## Vue-прототип: ещё не перенесённые поверхности

Запуск: `pnpm run prototype:dev --port 5174 --strictPort`. Подтверди URL из
вывода сервера. Маршруты определены в [App.vue](../../../../docs/prototype-app/src/App.vue):

| Область                | Query                                            |
| ---------------------- | ------------------------------------------------ |
| Home empty             | `/?prototype=home&scenario=first-run`            |
| Project                | `/?prototype=project`                            |
| Слои regional guidance | `/?prototype=project&scenario=regional-guidance` |
| Smart Patch            | `/?prototype=project&scenario=smart-patch`       |
| Staging                | `/?prototype=project&scenario=staging`           |
| Model Manager          | `/?prototype=model-manager`                      |
| Preset Manager         | `/?prototype=preset-manager`                     |

Используй браузерную сессию или существующие Playwright tests; настройки браузера
и `CHROMIUM_PATH` описаны в [playwright.config.ts](../../../../docs/prototype-app/playwright.config.ts).
Селекторы бери из тестов именно этой поверхности: в прототипе dialog называется
`Model Manager prototype` ([тесты](../../../../docs/prototype-app/tests/model-manager.spec.ts)),
а Home empty — `No projects in this workspace yet`
([тесты](../../../../docs/prototype-app/tests/home.spec.ts)); Electron использует другие имена.
Например, `pnpm run prototype:test docs/prototype-app/tests/home.spec.ts` проверяет
Home. Тестовый прогон не заменяет визуальный просмотр и не доказывает production.

## После разрешённого исправления

Сопоставляй before/after при одинаковых данных, масштабе и размере окна. Для
TypeScript/Vue выполни `pnpm run typecheck`; для prototype UI — обязательный
`pnpm run prototype:test`. Для production layout используй подходящий сценарий
`app:smoke` и прямую визуальную проверку; полный smoke содержит также другие
границы и нужен по масштабу изменения, а не при каждом аудите.

Этот guide использует существующий [Electron smoke](../../../../scripts/smoke-desktop.mjs).
Разделение функционального и визуального проходов также описано в
[playwright-interactive](https://github.com/openai/skills/blob/main/skills/.curated/playwright-interactive/SKILL.md).
Внешний skill служит референсом, не зависимостью или автоматическим детектором.
