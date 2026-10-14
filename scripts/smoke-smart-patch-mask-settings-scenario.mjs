/** Real native owned mask-settings qualification; no synthetic Project or pixel replies. */
import assert from 'node:assert/strict'
import { expect } from '@playwright/test'

const field = (ctx, kind) =>
  ctx
    .window()
    .locator(
      `input[aria-label="${kind === 'mask-blur' ? 'Smart Patch mask blur' : 'Smart Patch bbox padding'}"]`,
    )
const keyFor = (kind) => (kind === 'mask-blur' ? 'blur' : 'padding')
const fitButton = (ctx) =>
  ctx.canvas().getByRole('button', { name: 'Fit Patch BBox to Mask', exact: true })
const request = (tab, kind, value) => ({
  kind,
  documentId: tab.documentId,
  documentRevision: tab.documentRevision,
  value,
})
const withoutSettingsAndUrls = ({
  maskSettings: _maskSettings,
  maskImageUrl: _maskImageUrl,
  imageUrl: _imageUrl,
  ...layer
}) => layer
const withoutUrls = ({ maskImageUrl: _maskImageUrl, imageUrl: _imageUrl, ...layer }) => layer
let settingsEvidenceSerial = 0

async function settledSettings(ctx) {
  await expect(
    ctx.window().getByRole('button', { name: 'Clear history', exact: true }),
  ).toBeHidden()
  await expect(field(ctx, 'mask-blur')).toBeEnabled()
  await expect(field(ctx, 'bbox-padding')).toBeEnabled()
  await ctx.barrier()
  await expect(field(ctx, 'mask-blur')).toBeEnabled()
  await expect(field(ctx, 'bbox-padding')).toBeEnabled()
}

async function diagnoseField(ctx, id, kind, value, stage) {
  const tab = await ctx.current()
  const ui = await field(ctx, kind).evaluate((input) => {
    const section = input.closest('[aria-label="Smart Patch mask"]')
    return {
      value: input.value,
      disabled: input.disabled,
      focused: document.activeElement === input,
      activeElement: {
        label: document.activeElement?.getAttribute('aria-label') ?? null,
        tag: document.activeElement?.tagName ?? null,
      },
      sectionState: section?.getAttribute('data-mask-settings-state') ?? null,
      sectionDataset: section ? { ...section.dataset } : null,
      popoverConfirmations: [...document.querySelectorAll('button')]
        .filter((button) => button.textContent.trim() === 'Clear history')
        .map((button) => ({
          disabled: button.disabled,
          rect: button.getBoundingClientRect().toJSON(),
        })),
    }
  })
  ctx.settingsDiagnostic(`${kind}-${value}-${stage}`, {
    ownerId: id,
    documentId: tab.documentId,
    documentRevision: tab.documentRevision,
    mainSettings: ctx.patch(tab, id).maskSettings,
    mainCanUndo: tab.canUndo,
    mainCanRedo: tab.canRedo,
    settingsCommandCount: (await ctx.settingsCommands()).length,
    ui,
  })
}

async function clearHistory(ctx) {
  await ctx.window().getByRole('button', { name: 'Clear Project History', exact: true }).click()
  await ctx.window().getByRole('button', { name: 'Clear history', exact: true }).click()
  await expect.poll(async () => (await ctx.current()).canUndo).toBe(false)
  await expect.poll(async () => (await ctx.current()).canRedo).toBe(false)
  await settledSettings(ctx)
}
function pixelsEqual(before, after, label) {
  assert.deepEqual(after.bounds, before.bounds, label)
  assert.ok(after.bytes.equals(before.bytes) && after.alpha.equals(before.alpha), label)
}
async function pixelsFor(ctx, tab, label) {
  const result = {}
  for (const id of [ctx.patchAId, ctx.patchBId])
    result[id] = await ctx.maskPixels(ctx.patch(tab, id), `${label}-input-${id}`)
  return result
}
async function assertPixelsRetained(ctx, before, after, label, inputPixels) {
  for (const id of [ctx.patchAId, ctx.patchBId]) {
    assert.deepEqual(
      ctx.patch(after, id).mask,
      ctx.patch(before, id).mask,
      `${label}: mask revision and descriptor`,
    )
    const output = await ctx.maskPixels(ctx.patch(after, id), `${label}-output-${id}`)
    pixelsEqual(inputPixels[id], output, `${label}: exact existing mask PNG/alpha`)
  }
}
async function commitField(ctx, id, kind, value, trigger, proveHistory = true) {
  const evidenceLabel = `settings-${++settingsEvidenceSerial}-${kind}-${id}-${value}`
  await ctx.select(id)
  if (proveHistory) await clearHistory(ctx)
  await settledSettings(ctx)
  const before = await ctx.current()
  const inputPixels = await pixelsFor(ctx, before, evidenceLabel)
  const count = (await ctx.settingsCommands()).length
  const input = field(ctx, kind)
  await diagnoseField(ctx, id, kind, value, 'before-fill')
  await input.focus()
  await expect(input).toBeFocused()
  await input.fill(String(value))
  await diagnoseField(ctx, id, kind, value, 'after-fill')
  if (trigger === 'enter') await ctx.window().keyboard.press('Enter')
  else await ctx.window().keyboard.press('Tab')
  await diagnoseField(ctx, id, kind, value, trigger === 'enter' ? 'after-enter' : 'after-blur')
  await expect
    .poll(async () => (await ctx.settingsCommands()).filter((row) => row.completed).length)
    .toBe(count + 1)
  await expect
    .poll(async () => ctx.patch(await ctx.current(), id).maskSettings[keyFor(kind)])
    .toBe(value)
  const row = (await ctx.settingsCommands()).at(-1)
  assert.equal(row.ok, true, JSON.stringify(row.error))
  assert.equal(row.args[0], ctx.projectId)
  assert.equal(row.args[1], id)
  assert.deepEqual(row.args[2], request(before, kind, value))
  await ctx.barrier()
  await settledSettings(ctx)
  await diagnoseField(ctx, id, kind, value, 'after-settled-commit')
  const after = await ctx.current()
  const focusAfterCommit = await ctx.window().evaluate(() => ({
    label: document.activeElement?.getAttribute('aria-label') ?? null,
    tag: document.activeElement?.tagName ?? null,
  }))
  assert.equal(row.documentRevision, after.documentRevision)
  assert.notEqual(after.documentRevision, before.documentRevision)
  assert.equal(
    ctx.patch(after, id).maskSettings[keyFor(kind === 'mask-blur' ? 'bbox-padding' : 'mask-blur')],
    ctx.patch(before, id).maskSettings[keyFor(kind === 'mask-blur' ? 'bbox-padding' : 'mask-blur')],
  )
  assert.deepEqual(
    withoutSettingsAndUrls(ctx.patch(after, id)),
    withoutSettingsAndUrls(ctx.patch(before, id)),
    'Changing a scalar must not fit bbox, change draft, internal size or mask pixels/revision',
  )
  const other = id === ctx.patchAId ? ctx.patchBId : ctx.patchAId
  assert.deepEqual(
    withoutUrls(ctx.patch(after, other)),
    withoutUrls(ctx.patch(before, other)),
    'A field commit cannot change its neighboring owner',
  )
  ctx.assertNormal(after)
  if (trigger === 'enter') {
    await expect(input).toBeFocused()
    await ctx.window().keyboard.press('Tab')
    await ctx.barrier()
    await diagnoseField(ctx, id, kind, value, 'after-enter-then-blur')
    assert.equal(
      (await ctx.settingsCommands()).length,
      count + 1,
      'Enter followed by blur must publish only one command',
    )
    assert.deepEqual(ctx.exactState(await ctx.current()), ctx.exactState(after))
  }
  await assertPixelsRetained(ctx, before, after, evidenceLabel, inputPixels)
  if (proveHistory) {
    const undo = await ctx.history('undo')
    assert.deepEqual(
      ctx.content(undo),
      ctx.content(before),
      'One Undo restores the prior owned scalar and all surrounding metadata',
    )
    assert.equal(undo.canUndo, false, 'One completed field change is exactly one Undo entry')
    const redo = await ctx.history('redo')
    assert.deepEqual(ctx.content(redo), ctx.content(after))
    assert.equal(redo.canRedo, false)
    await assertPixelsRetained(ctx, before, redo, `${evidenceLabel}-history`, inputPixels)
  }
  ctx.check(
    `Actual ${kind}=${value} on ${id}: ${trigger} commits once, neighboring field/owner and bbox/PNG unchanged${proveHistory ? ', one exact Undo/Redo' : ''}`,
    { focusAfterCommit },
  )
  return await ctx.current()
}

async function fit(ctx, expected, label) {
  await clearHistory(ctx)
  const before = await ctx.current()
  const inputPixels = await pixelsFor(ctx, before, label)
  const count = (await ctx.commands()).length
  await expect(fitButton(ctx)).toBeEnabled()
  await fitButton(ctx).click()
  await expect
    .poll(async () => (await ctx.commands()).filter((row) => row.completed).length)
    .toBe(count + 1)
  const row = (await ctx.commands()).at(-1)
  assert.equal(row.ok, true, JSON.stringify(row.error))
  assert.equal(row.args[1], ctx.patchBId)
  assert.equal(row.args[2].documentRevision, before.documentRevision)
  assert.equal(row.args[2].edit.kind, 'fit-bbox')
  const after = await ctx.current()
  assert.deepEqual(ctx.patch(after, ctx.patchBId).boundingBox, expected, label)
  assert.deepEqual(
    ctx.patch(after, ctx.patchBId).maskSettings,
    ctx.patch(before, ctx.patchBId).maskSettings,
  )
  assert.deepEqual(
    withoutUrls(ctx.patch(after, ctx.patchAId)),
    withoutUrls(ctx.patch(before, ctx.patchAId)),
  )
  ctx.assertNormal(after)
  await assertPixelsRetained(ctx, before, after, label, inputPixels)
  const undo = await ctx.history('undo')
  assert.deepEqual(ctx.content(undo), ctx.content(before))
  assert.equal(undo.canUndo, false)
  const redo = await ctx.history('redo')
  assert.deepEqual(ctx.content(redo), ctx.content(after))
  assert.equal(redo.canRedo, false)
  ctx.check(
    `${label}: literal outward8-grid bbox, exact mask/settings/other-owner retention and one Undo/Redo`,
  )
}

async function noOpAndInvalidDrafts(ctx) {
  const id = ctx.patchBId
  await ctx.select(id)
  await clearHistory(ctx)
  let before = await ctx.current()
  for (const kind of ['mask-blur', 'bbox-padding']) {
    const input = field(ctx, kind)
    const value = ctx.patch(before, id).maskSettings[keyFor(kind)]
    await input.focus()
    await ctx.window().keyboard.press('Tab')
    await input.fill(String(value))
    await ctx.window().keyboard.press('Enter')
    await ctx.window().keyboard.press('Tab')
    await ctx.barrier()
    assert.deepEqual(
      ctx.exactState(await ctx.current()),
      ctx.exactState(before),
      'Focus, blur and unchanged Enter cannot mint history/revision',
    )
    const result = await ctx.rawApi(
      'projects',
      'updateSmartPatchLayer',
      ctx.projectId,
      id,
      request(before, kind, value),
    )
    assert.equal(result.ok, true, JSON.stringify(result))
    await ctx.barrier()
    assert.deepEqual(
      ctx.exactState(await ctx.current()),
      ctx.exactState(before),
      'Main unchanged scalar is a no-op',
    )
    for (const raw of ['513', '-1', '1.5', '']) {
      before = await ctx.current()
      const count = (await ctx.settingsCommands()).length
      await input.fill(raw)
      await expect(input).toHaveValue(raw)
      await ctx.window().keyboard.press('Enter')
      await ctx.window().keyboard.press('Tab')
      await ctx.barrier()
      assert.equal(
        (await ctx.settingsCommands()).length,
        count,
        `Invalid raw ${kind}=${JSON.stringify(raw)} must never publish a clamped/coerced scalar`,
      )
      assert.deepEqual(ctx.exactState(await ctx.current()), ctx.exactState(before))
      await input.focus()
      await ctx.window().keyboard.press('Escape')
      await ctx.window().keyboard.press('Tab')
      await ctx.barrier()
      await expect(input).toHaveValue(String(value))
      assert.deepEqual(ctx.exactState(await ctx.current()), ctx.exactState(before))
    }
  }
  ctx.check(
    'Actual both settings: focus/blur/unchanged Enter and Main no-op preserve history; raw513/-1/1.5/blank Enter+blur publish no coerced scalar',
  )

  before = await ctx.current()
  let count = (await ctx.settingsCommands()).length
  await field(ctx, 'mask-blur').fill('63')
  await ctx.window().keyboard.press('Escape')
  await ctx.window().keyboard.press('Tab')
  await ctx.barrier()
  assert.deepEqual(ctx.exactState(await ctx.current()), ctx.exactState(before))
  assert.equal((await ctx.settingsCommands()).length, count)
  count = (await ctx.settingsCommands()).length
  await field(ctx, 'mask-blur').fill('63')
  await ctx.select(ctx.patchAId)
  await ctx.barrier()
  await expect(field(ctx, 'mask-blur')).toHaveValue('16')
  await expect(field(ctx, 'bbox-padding')).toHaveValue('8')
  assert.deepEqual(
    ctx.exactState(await ctx.current()),
    ctx.exactState(before),
    'Switching owner cancels the old typed draft before blur can commit or retarget it',
  )
  assert.equal((await ctx.settingsCommands()).length, count)
  await ctx.select(id)
  await expect(field(ctx, 'mask-blur')).toHaveValue('31')
  await expect(field(ctx, 'bbox-padding')).toHaveValue('5')
  ctx.check(
    'Actual Escape and owner switch cancel typed blur drafts; A remains16/8 and B remains31/5 with no history/command',
  )
}

async function refusals(ctx, stale) {
  const id = ctx.patchBId
  let tab = await ctx.current()
  for (const kind of ['mask-blur', 'bbox-padding']) {
    await ctx.settingsRefusal(
      `${kind} stale captured revision`,
      id,
      { ...request(tab, kind, 45), documentRevision: stale },
      'EDIT_CONFLICT',
    )
    for (const value of [-1, 513, 1.5, null, '16'])
      await ctx.settingsRefusal(
        `${kind} rejects ${JSON.stringify(value)}`,
        id,
        request(tab, kind, value),
        'IPC_INVALID_CALLER',
      )
    await ctx.settingsRefusal(
      `${kind} rejects extra key`,
      id,
      { ...request(tab, kind, 45), padding: 1 },
      'IPC_INVALID_CALLER',
    )
    await ctx.settingsRefusal(
      `${kind} wrong captured document`,
      id,
      { ...request(tab, kind, 45), documentId: '00000000-0000-4000-8000-000000000000' },
      'EDIT_CONFLICT',
    )
  }
  const name = ctx.patch(tab, id).name
  const card = ctx.window().locator(`[data-layer-id="${id}"]`)
  await card.getByRole('button', { name: `Lock ${name}`, exact: true }).click()
  await expect.poll(async () => ctx.patch(await ctx.current(), id).locked).toBe(true)
  await expect(field(ctx, 'mask-blur')).toBeDisabled()
  await expect(field(ctx, 'bbox-padding')).toBeDisabled()
  tab = await ctx.current()
  for (const kind of ['mask-blur', 'bbox-padding'])
    await ctx.settingsRefusal(
      `${kind} locked owner`,
      id,
      request(tab, kind, 45),
      'PROJECT_INVALID_INPUT',
    )
  await card.getByRole('button', { name: `Unlock ${name}`, exact: true }).click()
  await expect.poll(async () => ctx.patch(await ctx.current(), id).locked).toBe(false)
  await expect(field(ctx, 'mask-blur')).toBeEnabled()
  await expect(field(ctx, 'bbox-padding')).toBeEnabled()
  ctx.check(
    'Actual locked field controls disable; exact Main stale/invalid/foreign-document/locked refusals preserve project/history/saved bytes',
  )
}

async function focusedPaddingThenFit(ctx) {
  await ctx.select(ctx.patchBId)
  const before = await ctx.current()
  const inputPixels = await pixelsFor(ctx, before, 'focused-padding-fit')
  const settingsCount = (await ctx.settingsCommands()).length
  const maskCount = (await ctx.commands()).length
  await field(ctx, 'bbox-padding').fill('6')
  await fitButton(ctx).click()
  await expect
    .poll(async () => ctx.patch(await ctx.current(), ctx.patchBId).maskSettings.padding)
    .toBe(6)
  await ctx.barrier()
  const afterBlur = await ctx.current()
  ctx.check(
    'Actual focused padding6 on Fit click: captured scalar committed; subsequent Fit geometry and focus observed',
    {
      settingsCommands: (await ctx.settingsCommands()).length - settingsCount,
      fitCommands: (await ctx.commands()).length - maskCount,
      observed: ctx.patch(afterBlur, ctx.patchBId),
      focus: await ctx
        .window()
        .evaluate(
          () =>
            document.activeElement?.getAttribute('aria-label') ?? document.activeElement?.tagName,
        ),
    },
  )
  await expect
    .poll(async () => ({
      settings: ctx.patch(await ctx.current(), ctx.patchBId).maskSettings,
      bbox: ctx.patch(await ctx.current(), ctx.patchBId).boundingBox,
    }))
    .toEqual({
      settings: { blur: 31, padding: 6 },
      bbox: { x: 72, y: -72, width: 144, height: 264 },
    })
  const after = await ctx.current()
  assert.equal((await ctx.settingsCommands()).length, settingsCount + 1)
  assert.equal((await ctx.commands()).length, maskCount + 1)
  await assertPixelsRetained(ctx, before, after, 'focused-padding-fit', inputPixels)
  ctx.check(
    'Actual one Fit click after typing padding6 commits padding then fits using current31+6 margin, exact PNG unchanged',
  )
  await commitField(ctx, ctx.patchBId, 'bbox-padding', 5, 'enter', false)
  await fit(
    ctx,
    { x: 80, y: -64, width: 136, height: 256 },
    'Actual padding5 restored after focused-input Fit',
  )
}

async function keyboardFitAndInvalidDraft(ctx) {
  await ctx.select(ctx.patchBId)
  await settledSettings(ctx)
  for (const key of ['Space', 'Enter']) {
    const before = await ctx.current()
    const evidenceLabel = `keyboard-fit-${key.toLowerCase()}`
    const inputPixels = await pixelsFor(ctx, before, evidenceLabel)
    const maskCount = (await ctx.commands()).length
    const settingsCount = (await ctx.settingsCommands()).length
    const button = fitButton(ctx)
    await expect(button).toBeEnabled()
    await button.focus()
    await expect(button).toBeFocused()
    await ctx.window().keyboard.press(key)
    await expect
      .poll(async () => (await ctx.commands()).filter((row) => row.completed).length)
      .toBe(maskCount + 1)
    const row = (await ctx.commands()).at(-1)
    assert.equal(row.ok, true, JSON.stringify(row.error))
    assert.equal(row.args[0], ctx.projectId)
    assert.equal(row.args[1], ctx.patchBId)
    assert.deepEqual(row.args[2], ctx.editRequest(before, ctx.patchBId, { kind: 'fit-bbox' }))
    await ctx.barrier()
    const after = await ctx.current()
    assert.deepEqual(
      ctx.exactState(after),
      ctx.exactState(before),
      'Keyboard Fit on an already fitted bbox is an exact document/history no-op',
    )
    assert.equal((await ctx.settingsCommands()).length, settingsCount)
    await assertPixelsRetained(ctx, before, after, evidenceLabel, inputPixels)
    ctx.check(
      `Actual focused Fit button ${key}: exactly one captured Main Fit, already-fitted bbox/settings/history/PNG unchanged`,
    )
  }
  const before = await ctx.current()
  const inputPixels = await pixelsFor(ctx, before, 'invalid-padding-fit')
  const maskCount = (await ctx.commands()).length
  const settingsCount = (await ctx.settingsCommands()).length
  await field(ctx, 'bbox-padding').fill('513')
  await expect(field(ctx, 'bbox-padding')).toHaveValue('513')
  await expect(fitButton(ctx)).toBeEnabled()
  await diagnoseField(ctx, ctx.patchBId, 'bbox-padding', 513, 'before-invalid-fit')
  await fitButton(ctx).click()
  await ctx.barrier()
  await diagnoseField(ctx, ctx.patchBId, 'bbox-padding', 513, 'after-invalid-fit')
  const after = await ctx.current()
  assert.equal(
    (await ctx.commands()).length,
    maskCount,
    'Fit cannot use old settings while a focused padding draft is invalid',
  )
  assert.equal(
    (await ctx.settingsCommands()).length,
    settingsCount,
    'Fit cannot coerce an invalid padding draft into a settings command',
  )
  assert.deepEqual(ctx.exactState(after), ctx.exactState(before))
  await expect(field(ctx, 'bbox-padding')).toHaveValue('513')
  await assertPixelsRetained(ctx, before, after, 'invalid-padding-fit', inputPixels)
  await field(ctx, 'bbox-padding').focus()
  await ctx.window().keyboard.press('Escape')
  await ctx.barrier()
  await expect(field(ctx, 'bbox-padding')).toHaveValue('5')
  assert.deepEqual(ctx.exactState(await ctx.current()), ctx.exactState(before))
  ctx.check(
    'Actual enabled Fit click with padding513: no settings/Fit command, exact document/history/PNG retained; raw draft preserved and Escape restores5',
  )
}

async function typedDraftThenHome(ctx) {
  await ctx.select(ctx.patchBId)
  await settledSettings(ctx)
  const before = await ctx.current()
  const settingsCount = (await ctx.settingsCommands()).length
  const maskCount = (await ctx.commands()).length
  const tabs = ctx.window().getByRole('tablist', { name: 'Open documents', exact: true })
  const selected = tabs.locator('[role="tab"][aria-selected="true"]')
  const projectName = await selected.getAttribute('aria-label')
  assert.ok(
    projectName && projectName !== 'Home',
    'The actual selected document tab must be this Project',
  )
  const projectTab = tabs.getByRole('tab', { name: projectName, exact: true })
  const home = tabs.getByRole('tab', { name: 'Home', exact: true })
  await field(ctx, 'mask-blur').fill('19')
  await expect(field(ctx, 'mask-blur')).toHaveValue('19')
  await diagnoseField(ctx, ctx.patchBId, 'mask-blur', 19, 'before-home-tab')
  await home.click()
  await ctx.barrier()
  const observed = await ctx.current()
  ctx.settingsDiagnostic('typed-blur-home-click', {
    documentBefore: ctx.exactState(before),
    documentAfter: ctx.exactState(observed),
    settingsCommands: (await ctx.settingsCommands()).length - settingsCount,
    maskCommands: (await ctx.commands()).length - maskCount,
    ui: await ctx.window().evaluate(() => ({
      tabs: [...document.querySelectorAll('nav[aria-label="Open documents"] [role="tab"]')].map(
        (tab) => ({
          name: tab.getAttribute('aria-label'),
          selected: tab.getAttribute('aria-selected'),
        }),
      ),
      activeElement:
        document.activeElement?.getAttribute('aria-label') ?? document.activeElement?.tagName,
      maskSettingsState:
        document
          .querySelector('[aria-label="Smart Patch mask"]')
          ?.getAttribute('data-mask-settings-state') ?? null,
    })),
  })
  await expect(home).toHaveAttribute('aria-selected', 'true')
  assert.equal(
    (await ctx.settingsCommands()).length,
    settingsCount,
    'Document navigation must cancel the focused old-owner draft before blur publishes',
  )
  assert.equal((await ctx.commands()).length, maskCount)
  assert.deepEqual(ctx.exactState(await ctx.current()), ctx.exactState(before))
  await projectTab.click()
  await expect(projectTab).toHaveAttribute('aria-selected', 'true')
  await ctx.select(ctx.patchBId)
  await settledSettings(ctx)
  await expect(field(ctx, 'mask-blur')).toHaveValue('31')
  await expect(field(ctx, 'bbox-padding')).toHaveValue('5')
  assert.deepEqual(ctx.exactState(await ctx.current()), ctx.exactState(before))
  assert.equal((await ctx.settingsCommands()).length, settingsCount)
  assert.equal((await ctx.commands()).length, maskCount)
  ctx.check(
    'Actual typed B blur19→Home document tab: navigation succeeds, draft cancels with no settings/mask command or history; return retains B31/5',
  )
}

async function typedBlurThenPaddingFocus(ctx) {
  await ctx.select(ctx.patchBId)
  await clearHistory(ctx)
  await settledSettings(ctx)
  const before = await ctx.current()
  const inputPixels = await pixelsFor(ctx, before, 'field-transfer')
  const count = (await ctx.settingsCommands()).length
  const maskCount = (await ctx.commands()).length
  await field(ctx, 'mask-blur').fill('32')
  await field(ctx, 'bbox-padding').click()
  await expect
    .poll(async () => (await ctx.settingsCommands()).filter((row) => row.completed).length)
    .toBe(count + 1)
  await expect
    .poll(async () => ctx.patch(await ctx.current(), ctx.patchBId).maskSettings.blur)
    .toBe(32)
  await settledSettings(ctx)
  await diagnoseField(ctx, ctx.patchBId, 'bbox-padding', 5, 'after-field-transfer')
  await expect(field(ctx, 'bbox-padding')).toBeFocused()
  const after = await ctx.current()
  const row = (await ctx.settingsCommands()).at(-1)
  assert.equal(row.ok, true, JSON.stringify(row.error))
  assert.equal(row.args[0], ctx.projectId)
  assert.equal(row.args[1], ctx.patchBId)
  assert.deepEqual(row.args[2], request(before, 'mask-blur', 32))
  assert.deepEqual(ctx.patch(after, ctx.patchBId).maskSettings, { blur: 32, padding: 5 })
  assert.deepEqual(
    withoutSettingsAndUrls(ctx.patch(after, ctx.patchBId)),
    withoutSettingsAndUrls(ctx.patch(before, ctx.patchBId)),
  )
  assert.deepEqual(
    withoutUrls(ctx.patch(after, ctx.patchAId)),
    withoutUrls(ctx.patch(before, ctx.patchAId)),
  )
  assert.equal((await ctx.commands()).length, maskCount)
  ctx.assertNormal(after)
  await assertPixelsRetained(ctx, before, after, 'field-transfer', inputPixels)
  const undo = await ctx.history('undo')
  assert.deepEqual(ctx.content(undo), ctx.content(before))
  assert.equal(undo.canUndo, false)
  const redo = await ctx.history('redo')
  assert.deepEqual(ctx.content(redo), ctx.content(after))
  assert.equal(redo.canRedo, false)
  ctx.check(
    'Actual typed blur32→one padding-field click: one captured scalar commit, destination retains focus through settlement, bbox/settings neighbor/PNG retained and one Undo/Redo',
  )
  await commitField(ctx, ctx.patchBId, 'mask-blur', 31, 'enter', false)
}

async function layouts(ctx) {
  await ctx.select(ctx.patchBId)
  const baseline = ctx.exactState(await ctx.current())
  const count = (await ctx.settingsCommands()).length
  try {
    for (const [width, height] of [
      [1440, 900],
      [900, 620],
    ]) {
      const native = await ctx.resizeNative(width, height)
      const section = ctx.window().getByRole('region', { name: 'Smart Patch mask', exact: true })
      await section.scrollIntoViewIfNeeded()
      await ctx.nativeFrames()
      await ctx.screenshot(`mask-settings-${width}x${height}`)
      const measured = await ctx.window().evaluate(() => {
        const rect = (element) => {
          const value = element.getBoundingClientRect()
          return {
            left: value.left,
            top: value.top,
            right: value.right,
            bottom: value.bottom,
            width: value.width,
            height: value.height,
          }
        }
        const section = document.querySelector('section[aria-label="Smart Patch mask"]')
        if (!section) throw new Error('Actual Mask section required')
        return {
          viewport: { width: innerWidth, height: innerHeight },
          section: rect(section),
          inputs: ['Mask brush size', 'Smart Patch mask blur', 'Smart Patch bbox padding'].map(
            (label) => {
              const input = section.querySelector(`input[aria-label="${label}"]`)
              if (!input) throw new Error(`Actual ${label} input required`)
              const surface = input.closest('.mask-size-input')
              if (!surface) throw new Error(`Actual ${label} control surface required`)
              const value = rect(input)
              const hit = document.elementFromPoint(
                (value.left + value.right) / 2,
                (value.top + value.bottom) / 2,
              )
              const associatedLabel = input.id
                ? document.querySelector(`label[for="${input.id}"]`)
                : null
              return {
                label,
                rect: value,
                surface: rect(surface),
                value: input.value,
                id: input.id,
                associatedLabel: associatedLabel
                  ? { text: associatedLabel.textContent.trim(), rect: rect(associatedLabel) }
                  : null,
                centerReachable: hit === input || input.contains(hit),
              }
            },
          ),
        }
      })
      ctx.settingsDiagnostic(`layout-${width}x${height}`, { native, measured })
      const brush = measured.inputs[0]
      for (const input of measured.inputs) {
        assert.ok(
          Math.abs(input.surface.width - brush.surface.width) <= 1,
          `${input.label} compact width matches Brush size`,
        )
        assert.ok(
          Math.abs(input.surface.right - brush.surface.right) <= 1,
          `${input.label} right edge aligns with Brush size`,
        )
        assert.ok(
          input.surface.width < measured.section.width / 2,
          `${input.label} remains compact rather than occupying most of the section`,
        )
        assert.ok(
          input.rect.left >= -1 &&
            input.rect.top >= -1 &&
            input.rect.right <= measured.viewport.width + 1 &&
            input.rect.bottom <= measured.viewport.height + 1,
          `${input.label} fits actual native viewport`,
        )
        assert.ok(
          input.surface.left >= -1 &&
            input.surface.top >= -1 &&
            input.surface.right <= measured.viewport.width + 1 &&
            input.surface.bottom <= measured.viewport.height + 1,
          `${input.label} visible control surface fits actual native viewport`,
        )
        assert.equal(input.centerReachable, true, `${input.label} center is reachable`)
        if (input.label !== 'Mask brush size')
          assert.ok(input.associatedLabel, `${input.label} has an actual associated visible label`)
      }
      await ctx.barrier()
      assert.deepEqual(
        ctx.exactState(await ctx.current()),
        baseline,
        'Resize/scroll/audit cannot commit metadata, geometry or pixels',
      )
      assert.equal((await ctx.settingsCommands()).length, count)
      ctx.check(
        `Mask settings native${width}x${height}: compact input widths/right edges match Brush size, labels and centers reachable, screenshot recorded`,
        { native, measured },
      )
    }
  } finally {
    await ctx.resizeNative(1440, 900)
    await ctx.barrier()
  }
}

export async function runMaskSettingsBeforeSave(ctx) {
  let state = await ctx.current()
  const stale = state.documentRevision
  for (const id of [ctx.patchAId, ctx.patchBId]) {
    assert.deepEqual(ctx.patch(state, id).maskSettings, { blur: 16, padding: 8 })
    await ctx.select(id)
    await expect(field(ctx, 'mask-blur')).toHaveValue('16')
    await expect(field(ctx, 'bbox-padding')).toHaveValue('8')
  }
  await commitField(ctx, ctx.patchBId, 'mask-blur', 31, 'enter')
  await commitField(ctx, ctx.patchBId, 'bbox-padding', 5, 'blur')
  state = await ctx.current()
  assert.deepEqual(ctx.patch(state, ctx.patchBId).mask.bounds, {
    x: 116,
    y: -28,
    width: 60,
    height: 180,
  })
  await fit(
    ctx,
    { x: 80, y: -64, width: 136, height: 256 },
    'Actual blur31+padding5 Fit around116,-28,60,180',
  )
  await commitField(ctx, ctx.patchBId, 'mask-blur', 0, 'blur')
  await commitField(ctx, ctx.patchBId, 'bbox-padding', 0, 'enter')
  await fit(
    ctx,
    { x: 112, y: -32, width: 64, height: 184 },
    'Actual blur0+padding0 Fit around116,-28,60,180',
  )
  await commitField(ctx, ctx.patchBId, 'mask-blur', 31, 'enter', false)
  await commitField(ctx, ctx.patchBId, 'bbox-padding', 5, 'blur', false)
  await fit(ctx, { x: 80, y: -64, width: 136, height: 256 }, 'Actual restored blur31+padding5 Fit')
  await noOpAndInvalidDrafts(ctx)
  await focusedPaddingThenFit(ctx)
  await keyboardFitAndInvalidDraft(ctx)
  await refusals(ctx, stale)
  await typedBlurThenPaddingFocus(ctx)
  await typedDraftThenHome(ctx)
  await layouts(ctx)
}

export async function runMaskSettingsRecovery(ctx) {
  const before = await ctx.current()
  const inputPixels = await pixelsFor(ctx, before, 'unsaved-settings-for-crash')
  assert.deepEqual(ctx.patch(before, ctx.patchAId).maskSettings, { blur: 16, padding: 8 })
  assert.deepEqual(ctx.patch(before, ctx.patchBId).maskSettings, { blur: 31, padding: 5 })
  await commitField(ctx, ctx.patchAId, 'mask-blur', 9, 'enter')
  await commitField(ctx, ctx.patchAId, 'bbox-padding', 11, 'blur')
  await assertPixelsRetained(
    ctx,
    before,
    await ctx.current(),
    'unsaved-settings-for-crash',
    inputPixels,
  )
  ctx.check(
    'Actual unsaved A blur9/padding11, B31/5 and exact owned PNG retained for existing physical crash→Home Recover',
  )
}

export async function assertMaskSettingsStored(ctx, project, label) {
  const current = await ctx.current()
  for (const id of [ctx.patchAId, ctx.patchBId]) {
    const stored = project.layers.find((layer) => layer.id === id)
    assert.equal(stored.kind, 'smart-patch')
    assert.deepEqual(
      stored.maskSettings,
      ctx.patch(current, id).maskSettings,
      `${label}: actual raw package metadata matches owned settings`,
    )
    assert.deepEqual(
      stored.maskSettings,
      id === ctx.patchBId
        ? { blur: 31, padding: 5 }
        : label === 'painted-masks-recovered'
          ? { blur: 9, padding: 11 }
          : { blur: 16, padding: 8 },
    )
  }
  ctx.check(`${label}: actual raw .igs stores each owned blur/padding independently`)
}

export async function assertMaskSettingsReopened(ctx, recovered) {
  const current = await ctx.current()
  for (const [id, settings] of [
    [ctx.patchAId, recovered ? { blur: 9, padding: 11 } : { blur: 16, padding: 8 }],
    [ctx.patchBId, { blur: 31, padding: 5 }],
  ]) {
    assert.deepEqual(ctx.patch(current, id).maskSettings, settings)
    await ctx.select(id)
    await expect(field(ctx, 'mask-blur')).toHaveValue(String(settings.blur))
    await expect(field(ctx, 'bbox-padding')).toHaveValue(String(settings.padding))
  }
  ctx.check(
    `Actual ${recovered ? 'crash recovery/recovered Save reopen' : 'clean Save reopen'}: A${recovered ? '9/11' : '16/8'} and B31/5 restore owned metadata and real input values`,
  )
}
