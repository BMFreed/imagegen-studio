import { expect, test } from '@playwright/test'

test('opacity label focuses the selected layer input without changing its value', async ({
  page,
}) => {
  await page.goto('/?prototype=project')

  const properties = page.getByRole('toolbar', { name: 'Selected layer properties' })
  for (const [layer, inputName] of [
    ['Portrait Base', 'Layer opacity'],
    ['Face lighting', 'Region opacity'],
  ]) {
    await page.getByRole('button', { exact: true, name: `Select ${layer}` }).click()
    const input = properties.getByRole('textbox', { exact: true, name: inputName })
    const label = properties.locator('label', { hasText: 'Opacity' })
    const originalValue = await input.inputValue()

    expect(await label.evaluate((element: HTMLLabelElement) => element.control?.id)).toBe(
      await input.getAttribute('id'),
    )
    await label.click()
    await expect(input).toBeFocused()
    await expect(input).toHaveValue(originalValue)
  }
})

test('labels stay bound to their own sliders when a value is shown beside the control', async ({
  page,
}) => {
  await page.goto('/?prototype=project')
  await page.evaluate(async () => {
    const loadModule = (path: string) => import(path)
    const { createApp, h } = await loadModule('/@id/vue')
    const { default: LabeledControl } = await loadModule('/src/components/LabeledControl.vue')
    const host = document.createElement('div')
    host.dataset['testid'] = 'labeled-control-demo'
    document.body.append(host)

    createApp({
      render: () =>
        h(
          'div',
          null,
          ['Mask opacity', 'Raster opacity'].map((label) =>
            h(
              LabeledControl,
              { label, value: '50%' },
              {
                default: ({ controlId }: { controlId: string }) =>
                  h('input', { id: controlId, max: 100, min: 0, type: 'range', value: 50 }),
              },
            ),
          ),
        ),
    }).mount(host)
  })

  const demo = page.getByTestId('labeled-control-demo')
  const ids: string[] = []
  for (const labelText of ['Mask opacity', 'Raster opacity']) {
    const label = demo.getByText(labelText, { exact: true })
    const field = label.locator('..')
    const slider = field.getByRole('slider')
    const id = await slider.getAttribute('id')
    expect(id).toBeTruthy()
    ids.push(id!)
    expect(await label.evaluate((element: HTMLLabelElement) => element.control?.id)).toBe(id)
    await label.click()
    await expect(slider).toBeFocused()
    await expect(field.locator('output')).toHaveText('50%')
  }
  expect(new Set(ids).size).toBe(2)
})
