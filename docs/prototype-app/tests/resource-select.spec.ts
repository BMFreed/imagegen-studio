import { expect, test } from '@playwright/test'

test('Project resource search is selection only and exposes an accessible option list', async ({
  page,
}) => {
  await page.goto('/?prototype=project')

  const loraSelect = page.getByLabel('Add LoRA', { exact: true })
  await loraSelect.locator('.n-base-selection-label').focus()
  const search = loraSelect.locator('input')
  await expect(search).toBeFocused()
  await expect(search).toHaveAttribute('role', 'combobox')
  await expect(search).toHaveAttribute('aria-expanded', 'true')
  const loraList = page.getByRole('listbox', { name: 'Add LoRA options' })
  await expect(loraList).toBeVisible()
  await expect(search).toHaveAttribute('aria-controls', (await loraList.getAttribute('id'))!)
  await search.fill('no matching resource')
  await expect(loraList.getByRole('option')).toHaveCount(0)
  await expect(search).not.toHaveAttribute('aria-activedescendant', /.+/)
  await page.keyboard.press('Enter')
  await expect(page.getByRole('switch', { name: 'Enable Detail Tweaker' })).toHaveCount(0)

  await search.fill('intricate detail')
  await expect(loraList.getByRole('option')).toHaveCount(1)
  const detail = loraList.getByRole('option', { name: /Detail Tweaker/ })
  await expect(detail).toContainText('Illustrious')
  await expect(detail).toContainText('intricate detail')
  await page.keyboard.press('ArrowDown')
  await expect(search).toHaveAttribute('aria-activedescendant', /.+/)
  await expect(detail).toHaveAttribute('id', (await search.getAttribute('aria-activedescendant'))!)
  await page.keyboard.press('Enter')
  await expect(page.getByRole('switch', { name: 'Enable Detail Tweaker' })).toBeVisible()

  await loraSelect.click()
  const added = page.getByRole('listbox', { name: 'Add LoRA options' }).getByRole('option', {
    name: /Detail Tweaker/,
  })
  await expect(added).toHaveAttribute('aria-disabled', 'true')
  await added.click({ force: true })
  await expect(page.getByRole('switch', { name: 'Enable Detail Tweaker' })).toHaveCount(1)
})

test('resource preview and metadata follow the supplied model while selection stays compact', async ({
  page,
}) => {
  await page.goto('/?prototype=project')
  await page.evaluate(async () => {
    const loadModule = (path: string) => import(path)
    const runtime = await loadModule('/@id/vue')
    const select = (await loadModule('/src/components/generation/GenerationResourceSelect.vue'))
      .default
    const state = runtime.reactive({
      disabledIds: [] as string[],
      resources: [
        {
          baseModel: 'SDXL',
          id: 'amber',
          name: 'Amber Portrait',
          previewSrc: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg"/>',
          triggerPhrases: ['soft glow'],
        },
        { baseModel: 'Flux', id: 'graphite', name: 'Graphite Ink', triggerPhrases: ['ink wash'] },
        {
          baseModel: 'SDXL',
          id: 'missing',
          missing: true,
          name: 'Lost Sketch',
          triggerPhrases: [],
        },
      ],
      value: 'amber' as string | null,
    })
    Object.assign(globalThis, { resourceSelectFixture: state })
    const host = document.createElement('div')
    host.id = 'resource-select-fixture'
    document.body.append(host)
    runtime
      .createApp({
        render: () =>
          runtime.h(select, {
            ariaLabel: 'Fixture resource',
            disabledIds: state.disabledIds,
            modelValue: state.value,
            'onUpdate:modelValue': (next: string | null) => {
              state.value = next
            },
            resources: state.resources,
          }),
      })
      .mount(host)
  })

  const picker = page.locator('#resource-select-fixture').getByLabel('Fixture resource', {
    exact: true,
  })
  await expect(picker).toContainText('Amber Portrait')
  expect((await picker.boundingBox())!.height).toBeLessThanOrEqual(36)
  await picker.click()
  const list = page.getByRole('listbox', { name: 'Fixture resource options' })
  const amber = list.getByRole('option', { name: /Amber Portrait/ })
  await expect(amber).toHaveAttribute('aria-selected', 'true')
  await expect(amber.locator('img')).toHaveAttribute('src', /data:image\/svg\+xml/)
  await expect(amber).toContainText('SDXL')
  await expect(amber).toContainText('soft glow')
  const missing = list.getByRole('option', { name: /Lost Sketch/ })
  await expect(missing).toHaveAttribute('aria-disabled', 'true')
  await expect(missing).toContainText('Missing')
  await expect(missing).not.toContainText('Added')

  await page.evaluate(() => {
    const state = (
      globalThis as {
        resourceSelectFixture: {
          disabledIds: string[]
          resources: { name: string; triggerPhrases: string[] }[]
          value: string | null
        }
      } & typeof globalThis
    ).resourceSelectFixture
    state.resources[0]!.name = 'Amber Portrait Evening Edition'
    state.resources[0]!.triggerPhrases = ['rim light']
    state.disabledIds.push('graphite')
  })

  await expect(picker).toContainText('Amber Portrait Evening Edition')
  await expect(picker).not.toContainText('SDXL')
  await expect(picker).not.toContainText('rim light')
  await picker.locator('input').fill('rim light')
  await expect(list.getByRole('option')).toHaveCount(1)
  await expect(list.getByRole('option')).toContainText('Amber Portrait Evening Edition')
  await picker.locator('input').fill('ink wash')
  const graphite = list.getByRole('option', { name: /Graphite Ink/ })
  await expect(graphite).toHaveAttribute('aria-disabled', 'true')
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Enter')
  await page.keyboard.press('Escape')
  await expect(picker).toContainText('Amber Portrait Evening Edition')
})
