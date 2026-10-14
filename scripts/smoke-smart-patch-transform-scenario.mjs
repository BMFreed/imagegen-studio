/** Real native Transform/Fit qualification. Pixel oracles do not import production geometry. */
import assert from 'node:assert/strict'
import { expect } from '@playwright/test'

const panel = (ctx) => ctx.canvas().locator('.canvas-area')
const applyButton = (ctx) =>
  ctx.canvas().getByRole('button', { name: 'Apply mask transform', exact: true })
const cancelButton = (ctx) =>
  ctx.canvas().getByRole('button', { name: 'Cancel mask transform', exact: true })
const fitButton = (ctx) =>
  ctx.canvas().getByRole('button', { name: 'Fit Patch BBox to Mask', exact: true })

function near(actual, expected, message, epsilon = 0.00001) {
  assert.ok(
    Number.isFinite(actual) && Math.abs(actual - expected) < epsilon,
    `${message}: expected ${expected}, got ${actual}`,
  )
}
function integer(actual, message) {
  const value = Math.round(actual)
  near(actual, value, message)
  return value
}
async function pose(ctx) {
  const result = await panel(ctx).evaluate((host) => {
    const content = host.querySelector('.konvajs-content')
    if (!(content instanceof HTMLElement)) throw new Error('Actual Konva content is unavailable')
    const rect = content.getBoundingClientRect()
    return {
      node: JSON.parse(host.dataset.maskTransformNode ?? 'null'),
      handles: JSON.parse(host.dataset.maskTransformHandles ?? 'null'),
      content: {
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
        clientWidth: content.clientWidth,
        clientHeight: content.clientHeight,
      },
      camera: {
        x: Number(host.dataset.cameraX),
        y: Number(host.dataset.cameraY),
        scale: Number(host.dataset.cameraScale),
      },
    }
  })
  assert.ok(
    result.node && result.handles,
    'Actual Konva node and Transformer anchor diagnostics are required',
  )
  assert.ok(
    result.content.clientWidth > 0 && result.content.clientHeight > 0 && result.camera.scale > 0,
  )
  return result
}
function stagePoint(view, point) {
  return {
    x: view.camera.x + point.x * view.camera.scale,
    y: view.camera.y + point.y * view.camera.scale,
  }
}
function screenPoint(view, point) {
  // Invert Konva Stage._getContentPosition's actual CSS/client scaling.
  // A fractional flex viewport is not necessarily one CSS pixel per Stage pixel.
  return {
    x: view.content.left + (point.x * view.content.width) / view.content.clientWidth,
    y: view.content.top + (point.y * view.content.height) / view.content.clientHeight,
  }
}
function screenWorldPoint(view, point) {
  return screenPoint(view, stagePoint(view, point))
}
async function begin(ctx, id) {
  await ctx.select(id)
  await ctx.tool('Transform Mask')
  await expect(panel(ctx)).toHaveAttribute('data-mask-transform-active', 'true')
  await expect(cancelButton(ctx)).toBeVisible()
  await expect(fitButton(ctx)).toBeDisabled()
  return await pose(ctx)
}
async function drag(ctx, from, to) {
  await ctx.window().mouse.move(from.x, from.y)
  await ctx.window().mouse.down()
  await ctx.window().mouse.move(to.x, to.y, { steps: 8 })
  await ctx.window().mouse.up()
  await ctx.nativeFrames()
}
async function move(ctx, dx, dy) {
  const view = await pose(ctx)
  const { node } = view
  // A point inside the actual target rectangle, away from Transformer anchors.
  const start = screenWorldPoint(view, { x: node.x + 10, y: node.y + 10 })
  const finish = screenWorldPoint(view, { x: node.x + 10 + dx, y: node.y + 10 + dy })
  await drag(ctx, start, finish)
  const next = (await pose(ctx)).node
  near(next.x, node.x + dx, 'Actual native mask drag world X')
  near(next.y, node.y + dy, 'Actual native mask drag world Y')
  return next
}
async function scaleX(ctx, factor) {
  const before = await pose(ctx)
  const handle = before.handles['middle-right']
  assert.ok(handle, 'Actual right-middle resize anchor must exist')
  const start = screenPoint(before, handle)
  const finish = screenWorldPoint(before, {
    x: before.node.x + before.node.width * factor,
    y: before.node.y + before.node.height / 2,
  })
  await drag(ctx, start, finish)
  const next = (await pose(ctx)).node
  near(next.scaleX, factor, 'Actual native nonuniform X scale')
  near(next.scaleY, 1, 'Right-middle resize must preserve Y scale')
  return next
}
async function rotateQuarterTurn(ctx) {
  const before = await pose(ctx)
  const handle = before.handles.rotater
  assert.ok(handle, 'Actual rotate anchor must exist')
  const center = stagePoint(before, {
    x: before.node.x + before.node.width / 2,
    y: before.node.y + before.node.height / 2,
  })
  const start = screenPoint(before, handle)
  // Rotate in Stage space before applying the real independent CSS X/Y ratios.
  const finish = screenPoint(before, {
    x: center.x - (handle.y - center.y),
    y: center.y + (handle.x - center.x),
  })
  await drag(ctx, start, finish)
  const next = (await pose(ctx)).node
  near(next.rotationDegrees ?? next.rotation, 90, 'Actual native quarter-turn rotation')
  return next
}
async function clearHistory(ctx) {
  const window = ctx.window()
  await window.getByRole('button', { name: 'Clear Project History', exact: true }).click()
  await window.getByRole('button', { name: 'Clear history', exact: true }).click()
  await expect.poll(async () => (await ctx.current()).canUndo).toBe(false)
  await expect.poll(async () => (await ctx.current()).canRedo).toBe(false)
}
async function untouchedPreview(ctx, baseline, commandCount) {
  await ctx.barrier()
  assert.deepEqual(
    ctx.exactState(await ctx.current()),
    ctx.exactState(baseline),
    'Transform preview must not publish document pixels, metadata or history',
  )
  assert.equal(
    (await ctx.commands()).length,
    commandCount,
    'Pointerup is preview-only; no authoritative command before Apply',
  )
}
async function commit(ctx, id, before, commandCount, key = 'button') {
  await untouchedPreview(ctx, before, commandCount)
  await expect(applyButton(ctx)).toBeEnabled()
  if (key === 'enter') await panel(ctx).press('Enter')
  else await applyButton(ctx).click()
  await expect
    .poll(async () => (await ctx.commands()).filter((row) => row.completed).length)
    .toBe(commandCount + 1)
  const row = (await ctx.commands()).at(-1)
  assert.equal(row.ok, true, JSON.stringify(row.error))
  assert.equal(row.args[0], ctx.projectId)
  assert.equal(row.args[1], id)
  assert.equal(row.args[2].documentId, before.documentId)
  assert.equal(row.args[2].documentRevision, before.documentRevision)
  assert.equal(row.args[2].maskId, ctx.patch(before, id).mask.id)
  assert.equal(row.args[2].maskRevision, ctx.patch(before, id).mask.revision)
  assert.equal(row.args[2].edit.kind, 'transform')
  await expect
    .poll(async () => (await ctx.current()).documentRevision)
    .not.toBe(before.documentRevision)
  await expect(
    ctx.window().getByRole('button', { name: 'Save Project', exact: true }),
  ).toBeEnabled()
  await expect(panel(ctx)).toHaveAttribute('data-mask-transform-active', 'false')
  const after = await ctx.current()
  assert.equal(row.documentRevision, after.documentRevision)
  assert.equal(ctx.patch(after, id).mask.revision, ctx.patch(before, id).mask.revision + 1)
  assert.deepEqual(
    ctx.patch(after, id).boundingBox,
    ctx.patch(before, id).boundingBox,
    'Transform cannot change owned BBox',
  )
  const other = id === ctx.patchAId ? ctx.patchBId : ctx.patchAId
  const withoutUrl = ({ maskImageUrl: _maskImageUrl, ...layer }) => layer
  assert.deepEqual(
    withoutUrl(ctx.patch(after, other)),
    withoutUrl(ctx.patch(before, other)),
    'Transform cannot affect the other mask owner',
  )
  ctx.assertNormal(after)
  return { after, transform: row.args[2].edit.transform }
}
async function oneHistory(ctx, id, before, after, pixelsBefore, pixelsAfter, label) {
  const undo = await ctx.history('undo')
  assert.deepEqual(
    ctx.content(undo),
    ctx.content(before),
    'One Undo must restore the whole transform input',
  )
  assert.equal(undo.canUndo, false, 'A completed transform must have exactly one Undo entry')
  const undoPixels = await ctx.maskPixels(ctx.patch(undo, id), `${label}-undo`)
  assert.deepEqual(undoPixels.bounds, pixelsBefore.bounds)
  assert.ok(
    undoPixels.bytes.equals(pixelsBefore.bytes) && undoPixels.alpha.equals(pixelsBefore.alpha),
    'Undo must restore exact immutable PNG/alpha',
  )
  const redo = await ctx.history('redo')
  assert.deepEqual(ctx.content(redo), ctx.content(after))
  assert.equal(redo.canRedo, false)
  const redoPixels = await ctx.maskPixels(ctx.patch(redo, id), `${label}-redo`)
  assert.deepEqual(redoPixels.bounds, pixelsAfter.bounds)
  assert.ok(
    redoPixels.bytes.equals(pixelsAfter.bytes) && redoPixels.alpha.equals(pixelsAfter.alpha),
    'Redo must restore exact transformed PNG/alpha',
  )
  ctx.check(`Actual ${label}: preview-only gesture, one Apply command and one exact PNG Undo/Redo`)
}
function assertTranslated(before, after, dx, dy) {
  assert.deepEqual(after.bounds, {
    ...before.bounds,
    x: before.bounds.x + dx,
    y: before.bounds.y + dy,
  })
  assert.ok(
    after.alpha.equals(before.alpha),
    'Integer translation must preserve every independently decoded alpha byte',
  )
  assert.ok(
    after.bytes.equals(before.bytes),
    'Integer translation must reuse equivalent exact canonical PNG content',
  )
}
function assertQuarterTurn(before, after, transform) {
  const anchorX = integer(transform.x, 'Quarter-turn world anchor X')
  const anchorY = integer(transform.y, 'Quarter-turn world anchor Y')
  near(transform.scaleX, 1, 'Fresh transform X scale')
  near(transform.scaleY, 1, 'Fresh transform Y scale')
  near(transform.rotationDegrees, 90, 'Committed rotation angle')
  assert.deepEqual(after.bounds, {
    x: anchorX - before.height,
    y: anchorY,
    width: before.height,
    height: before.width,
  })
  const expected = Buffer.alloc(before.alpha.length)
  // PNG rows rotated clockwise: destination column H-1-sourceRow, row sourceColumn.
  for (let y = 0; y < before.height; y++)
    for (let x = 0; x < before.width; x++) {
      expected[x * before.height + before.height - 1 - y] = before.alpha[y * before.width + x]
    }
  assert.ok(
    after.alpha.equals(expected),
    'Real quarter-turn must transpose every asymmetrical source alpha byte correctly',
  )
}
async function fit(ctx, before, commandCount) {
  await expect(fitButton(ctx)).toBeEnabled()
  await fitButton(ctx).click()
  await expect
    .poll(async () => (await ctx.commands()).filter((row) => row.completed).length)
    .toBe(commandCount + 1)
  const row = (await ctx.commands()).at(-1)
  assert.equal(row.ok, true, JSON.stringify(row.error))
  assert.equal(row.args[1], ctx.patchBId)
  assert.equal(row.args[2].edit.kind, 'fit-bbox')
  assert.equal(row.args[2].documentRevision, before.documentRevision)
  return await ctx.current()
}

async function activeTransformLayouts(ctx, id) {
  const baseline = ctx.exactState(await ctx.current())
  const commandCount = (await ctx.commands()).length
  try {
    for (const [width, height] of [
      [1440, 900],
      [900, 620],
    ]) {
      const native = await ctx.resizeNative(width, height)
      await begin(ctx, id)
      await ctx.screenshot(`active-mask-transform-${width}x${height}`)
      const measured = await ctx.window().evaluate((ownerId) => {
        const rect = (element) => {
          if (!element) return null
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
        const describe = (element) => {
          if (!element) return null
          const value = rect(element)
          const centerHit = document.elementFromPoint(
            (value.left + value.right) / 2,
            (value.top + value.bottom) / 2,
          )
          const style = getComputedStyle(element)
          return {
            text: element.textContent.trim(),
            rect: value,
            display: style.display,
            visibility: style.visibility,
            centerHit: centerHit
              ? {
                  tag: centerHit.tagName,
                  classes: centerHit.className,
                  label: centerHit.getAttribute('aria-label'),
                  belongsToElement: element.contains(centerHit),
                }
              : null,
          }
        }
        const owner = document.querySelector(`[data-layer-id="${ownerId}"]`)
        const actions = document.querySelector('.mask-transform-actions')
        return {
          viewport: { width: innerWidth, height: innerHeight },
          canvas: rect(document.querySelector('.canvas-area')),
          readout: describe(document.querySelector('.bbox-readout')),
          actions: describe(actions),
          actionButtons: actions
            ? [...actions.querySelectorAll('button')].map((button) => ({
                name: button.getAttribute('aria-label') ?? button.textContent.trim(),
                ...describe(button),
              }))
            : [],
          selectedOwnerHeader: describe(owner?.querySelector('.entity-header')),
          rail: describe(document.querySelector('.tool-rail')),
        }
      }, id)
      assert.ok(measured.readout && measured.actions && measured.selectedOwnerHeader)
      assert.equal(measured.actionButtons.length, 2)
      const readout = measured.readout.rect
      const actions = measured.actions.rect
      const overlapWidth =
        Math.min(readout.right, actions.right) - Math.max(readout.left, actions.left)
      const overlapHeight =
        Math.min(readout.bottom, actions.bottom) - Math.max(readout.top, actions.top)
      assert.ok(
        overlapWidth <= 0 || overlapHeight <= 0,
        `Active Transform readout and Apply/Cancel must not overlap at ${width}x${height}`,
      )
      for (const button of measured.actionButtons) {
        assert.equal(
          button.centerHit?.belongsToElement,
          true,
          `${button.name} center must remain directly reachable at ${width}x${height}`,
        )
      }
      ctx.check(
        `Active Transform native ${width}x${height}: actual readout/actions do not overlap, both button centers reachable, screenshot and owner-header geometry recorded`,
        {
          native,
          measured,
        },
      )
      await cancelButton(ctx).click()
      await expect(panel(ctx)).toHaveAttribute('data-mask-transform-active', 'false')
      await ctx.barrier()
      assert.deepEqual(
        ctx.exactState(await ctx.current()),
        baseline,
        'Layout inspection and Cancel cannot publish mask pixels or history',
      )
      assert.equal((await ctx.commands()).length, commandCount)
    }
  } finally {
    await ctx.resizeNative(1440, 900)
    await ctx.barrier()
  }
}

export async function runMaskTransformBeforeSave(ctx) {
  const id = ctx.patchBId
  await ctx.select(id)
  await activeTransformLayouts(ctx, id)
  let state = await ctx.current()
  const staleRevision = state.documentRevision
  let pixels = await ctx.maskPixels(ctx.patch(state, id), 'transform-asymmetry-input')
  assert.deepEqual(
    pixels.bounds,
    { x: 40, y: 40, width: 120, height: 60 },
    'Declared native asymmetric fixture geometry',
  )
  assert.equal(ctx.at(pixels, 50, 50), 255)
  assert.equal(ctx.at(pixels, 70, 70), 0)
  assert.equal(ctx.at(pixels, 90, 90), 0, 'L-shaped notch contrasts a rectangular mask')
  assert.equal(ctx.at(pixels, 140, 45), 255)
  assert.equal(ctx.at(pixels, 140, 60), 0)

  await clearHistory(ctx)
  let before = await ctx.current()
  let count = (await ctx.commands()).length
  await begin(ctx, id)
  await move(ctx, 16, -8)
  await ctx.screenshot('mask-transform-move-preview')
  let result = await commit(ctx, id, before, count)
  let transformed = await ctx.maskPixels(ctx.patch(result.after, id), 'mask-transform-moved')
  assertTranslated(pixels, transformed, 16, -8)
  await oneHistory(ctx, id, before, result.after, pixels, transformed, 'mask-translation')
  pixels = transformed

  await clearHistory(ctx)
  before = await ctx.current()
  count = (await ctx.commands()).length
  await begin(ctx, id)
  await scaleX(ctx, 1.5)
  await ctx.screenshot('mask-transform-nonuniform-preview')
  result = await commit(ctx, id, before, count, 'enter')
  transformed = await ctx.maskPixels(ctx.patch(result.after, id), 'mask-transform-scaled')
  assert.deepEqual(transformed.bounds, { x: 56, y: 32, width: 180, height: 60 })
  for (const [x, y, expected] of [
    [72, 42, 255],
    [102, 62, 0],
    [132, 82, 0],
    [207, 37, 255],
    [207, 52, 0],
    [162, 52, 0],
  ]) {
    assert.equal(
      ctx.at(transformed, x, y),
      expected,
      `Analytical nonuniform-scale interior/exterior witness ${x},${y}`,
    )
  }
  await oneHistory(ctx, id, before, result.after, pixels, transformed, 'mask-nonuniform-scale')
  pixels = transformed

  await clearHistory(ctx)
  before = await ctx.current()
  count = (await ctx.commands()).length
  await begin(ctx, id)
  await rotateQuarterTurn(ctx)
  await ctx.screenshot('mask-transform-rotation-preview')
  result = await commit(ctx, id, before, count)
  transformed = await ctx.maskPixels(ctx.patch(result.after, id), 'mask-transform-rotated')
  assertQuarterTurn(pixels, transformed, result.transform)
  assert.deepEqual(
    transformed.bounds,
    { x: 116, y: -28, width: 60, height: 180 },
    'Actual Transformer rotates the declared rectangle around its center',
  )
  await oneHistory(ctx, id, before, result.after, pixels, transformed, 'mask-quarter-turn')
  pixels = transformed

  await clearHistory(ctx)
  before = await ctx.current()
  count = (await ctx.commands()).length
  state = await fit(ctx, before, count)
  assert.deepEqual(
    ctx.patch(state, id).boundingBox,
    { x: 88, y: -56, width: 112, height: 232 },
    '24px padding, outward8-grid: declared116,-28,60,180 mask fits88,-56..200,176',
  )
  assert.deepEqual(
    ctx.patch(state, id).mask,
    ctx.patch(before, id).mask,
    'Fit cannot change mask identity, pixels, world bounds or revision',
  )
  ctx.assertNormal(state)
  const fitted = await ctx.maskPixels(ctx.patch(state, id), 'mask-fit-unchanged-pixels')
  assert.ok(fitted.bytes.equals(pixels.bytes) && fitted.alpha.equals(pixels.alpha))
  let undo = await ctx.history('undo')
  assert.deepEqual(ctx.content(undo), ctx.content(before))
  assert.equal(undo.canUndo, false)
  let redo = await ctx.history('redo')
  assert.deepEqual(ctx.content(redo), ctx.content(state))
  const noOpBefore = await ctx.current()
  count = (await ctx.commands()).length
  const noOpAfter = await fit(ctx, noOpBefore, count)
  assert.deepEqual(
    ctx.exactState(noOpAfter),
    ctx.exactState(noOpBefore),
    'Repeated Fit must not mint a document revision or history entry',
  )
  undo = await ctx.history('undo')
  assert.deepEqual(ctx.content(undo), ctx.content(before))
  assert.equal(undo.canUndo, false, 'No-op Fit must not require a second Undo')
  redo = await ctx.history('redo')
  assert.deepEqual(ctx.content(redo), ctx.content(state))
  ctx.check(
    'Actual Fit: literal24px outward8-grid BBox, exact mask/other-owner/normal/Raster retention, one Undo and repeated-Fit no-op',
  )

  await begin(ctx, id)
  before = await ctx.current()
  count = (await ctx.commands()).length
  await move(ctx, 8, 4)
  await panel(ctx).press('Escape')
  await panel(ctx).press('Enter')
  await ctx.barrier()
  await expect(panel(ctx)).toHaveAttribute('data-mask-transform-active', 'false')
  assert.deepEqual(ctx.exactState(await ctx.current()), ctx.exactState(before))
  assert.equal((await ctx.commands()).length, count)
  ctx.check(
    'Actual Transform Escape and terminal Enter cancel preview without a command or history mutation',
  )

  await begin(ctx, id)
  before = await ctx.current()
  count = (await ctx.commands()).length
  await move(ctx, 8, 4)
  await ctx.select(ctx.patchAId)
  await panel(ctx).press('Enter')
  await ctx.barrier()
  assert.deepEqual(ctx.exactState(await ctx.current()), ctx.exactState(before))
  assert.equal((await ctx.commands()).length, count)
  ctx.check(
    'Actual owner switch cancels Transform preview; terminal Enter cannot retarget to A or B',
  )

  await begin(ctx, id)
  before = await ctx.current()
  count = (await ctx.commands()).length
  await move(ctx, 8, 4)
  await panel(ctx).focus()
  assert.equal(await panel(ctx).evaluate((host) => document.activeElement === host), true)
  const scaleBeforeWheel = Number(await panel(ctx).getAttribute('data-camera-scale'))
  assert.ok(scaleBeforeWheel > 0)
  const hostBox = await panel(ctx).boundingBox()
  assert.ok(hostBox)
  await ctx.window().mouse.move(hostBox.x + hostBox.width / 2, hostBox.y + hostBox.height * 0.65)
  await ctx.window().mouse.wheel(0, 120)
  await expect
    .poll(async () => Number(await panel(ctx).getAttribute('data-camera-scale')))
    .not.toBe(scaleBeforeWheel)
  await expect(panel(ctx)).toHaveAttribute('data-mask-transform-active', 'false')
  assert.equal(
    await panel(ctx).evaluate((host) => document.activeElement === host),
    true,
    'Real canvas wheel must change camera while retaining host focus; blur is not the cancellation trigger',
  )
  await panel(ctx).press('Enter')
  await ctx.barrier()
  assert.deepEqual(ctx.exactState(await ctx.current()), ctx.exactState(before))
  assert.equal((await ctx.commands()).length, count)
  ctx.check(
    'Actual focused-canvas wheel changes camera and cancels Transform preview; focus retained and terminal Enter publishes no document pixels',
    {
      scaleBeforeWheel,
      scaleAfterWheel: Number(await panel(ctx).getAttribute('data-camera-scale')),
    },
  )

  await ctx.select(id)
  const baseline = await ctx.current()
  const owner = ctx.patch(baseline, id)
  const edit = {
    kind: 'transform',
    transform: {
      x: owner.mask.bounds.x,
      y: owner.mask.bounds.y,
      scaleX: 1,
      scaleY: 1,
      rotationDegrees: 0,
    },
  }
  const identity = await ctx.rawApi(
    'projects',
    'editSmartPatchMask',
    ctx.projectId,
    id,
    ctx.editRequest(baseline, id, edit),
  )
  assert.equal(identity.ok, true, JSON.stringify(identity))
  await ctx.barrier()
  assert.deepEqual(
    ctx.exactState(await ctx.current()),
    ctx.exactState(baseline),
    'Identity Transform preserves revisions/history',
  )
  await ctx.refusal(
    'stale Transform captured revision',
    id,
    { ...ctx.editRequest(baseline, id, edit), documentRevision: staleRevision },
    ['EDIT_CONFLICT'],
  )
  await ctx.refusal(
    'stale Fit captured revision',
    id,
    { ...ctx.editRequest(baseline, id, { kind: 'fit-bbox' }), documentRevision: staleRevision },
    ['EDIT_CONFLICT'],
  )
  const foreignMask = ctx.patch(baseline, ctx.patchAId).mask.id
  for (const [label, action] of [
    ['Transform', edit],
    ['Fit', { kind: 'fit-bbox' }],
  ]) {
    await ctx.refusal(
      `${label} foreign owned mask`,
      id,
      { ...ctx.editRequest(baseline, id, action), maskId: foreignMask },
      ['EDIT_CONFLICT'],
    )
  }
  await ctx.refusal(
    'Transform refuses negative scale',
    id,
    ctx.editRequest(await ctx.current(), id, {
      kind: 'transform',
      transform: { ...edit.transform, scaleX: -1 },
    }),
    ['IPC_INVALID_CALLER'],
  )
  await ctx.refusal(
    'Transform refuses large prospective area before allocation',
    id,
    ctx.editRequest(await ctx.current(), id, {
      kind: 'transform',
      transform: { ...edit.transform, scaleX: 1000, scaleY: 1000 },
    }),
    ['MASK_LIMIT'],
  )
  const name = owner.name
  const card = ctx.window().locator(`[data-layer-id="${id}"]`)
  await card.getByRole('button', { name: `Lock ${name}`, exact: true }).click()
  await expect.poll(async () => ctx.patch(await ctx.current(), id).locked).toBe(true)
  for (const [label, action] of [
    ['Transform', edit],
    ['Fit', { kind: 'fit-bbox' }],
  ]) {
    await ctx.refusal(
      `${label} locked target`,
      id,
      ctx.editRequest(await ctx.current(), id, action),
      ['PROJECT_LAYER_LOCKED'],
    )
  }
  await expect(
    ctx.canvas().getByRole('button', { name: 'Transform Mask', exact: true }),
  ).toBeDisabled()
  await expect(fitButton(ctx)).toBeDisabled()
  await expect(ctx.canvas().getByRole('button', { name: 'Pan tool', exact: true })).toBeEnabled()
  await card.getByRole('button', { name: `Unlock ${name}`, exact: true }).click()
  await expect.poll(async () => ctx.patch(await ctx.current(), id).locked).toBe(false)
  await card.getByRole('button', { name: `Hide ${name}`, exact: true }).click()
  await expect.poll(async () => ctx.patch(await ctx.current(), id).visible).toBe(false)
  for (const [label, action] of [
    ['Transform', edit],
    ['Fit', { kind: 'fit-bbox' }],
  ]) {
    await ctx.refusal(
      `${label} hidden target`,
      id,
      ctx.editRequest(await ctx.current(), id, action),
      ['PROJECT_LAYER_HIDDEN'],
    )
  }
  await expect(
    ctx.canvas().getByRole('button', { name: 'Transform Mask', exact: true }),
  ).toBeDisabled()
  await expect(fitButton(ctx)).toBeDisabled()
  await card.getByRole('button', { name: `Show ${name}`, exact: true }).click()
  await expect.poll(async () => ctx.patch(await ctx.current(), id).visible).toBe(true)
  await clearHistory(ctx)
  const beforeEmpty = await ctx.current()
  await ctx.window().getByRole('button', { name: 'Clear mask', exact: true }).click()
  await expect.poll(async () => ctx.patch(await ctx.current(), id).mask.asset).toBe(null)
  for (const [label, action] of [
    ['Transform', edit],
    ['Fit', { kind: 'fit-bbox' }],
  ]) {
    await ctx.refusal(
      `${label} empty owned mask`,
      id,
      ctx.editRequest(await ctx.current(), id, action),
      ['MASK_INPUT_INVALID'],
    )
  }
  await expect(
    ctx.canvas().getByRole('button', { name: 'Transform Mask', exact: true }),
  ).toBeDisabled()
  await expect(fitButton(ctx)).toBeDisabled()
  const restored = await ctx.history('undo')
  assert.deepEqual(ctx.content(restored), ctx.content(beforeEmpty))
  const restoredPixels = await ctx.maskPixels(
    ctx.patch(restored, id),
    'mask-transform-empty-contrast-restored',
  )
  assert.ok(
    restoredPixels.bytes.equals(pixels.bytes) && restoredPixels.alpha.equals(pixels.alpha),
    'Empty contrast cleanup must restore exact transformed mask bytes',
  )
  ctx.check(
    'Real locked/hidden/empty Transform and Fit refuse through Main; contextual tools disable and Undo restores exact nonempty owner',
  )
  await ctx.screenshot('mask-transform-fit-tools-final')
  ctx.check(
    'Native Transform identity no-op and stale/invalid/oversized refusal leave exact document/history/saved bytes unchanged',
  )
  return await ctx.maskPixels(ctx.patch(await ctx.current(), id), 'mask-transform-before-save')
}

export async function runMaskTransformRecovery(ctx) {
  const id = ctx.patchAId
  await clearHistory(ctx)
  const before = await ctx.current()
  const pixels = await ctx.maskPixels(ctx.patch(before, id), 'mask-transform-unsaved-input')
  const count = (await ctx.commands()).length
  await begin(ctx, id)
  await move(ctx, 8, -8)
  const { after } = await commit(ctx, id, before, count)
  const transformed = await ctx.maskPixels(ctx.patch(after, id), 'mask-transform-unsaved-output')
  assertTranslated(pixels, transformed, 8, -8)
  ctx.check(
    'Actual unsaved Transform publishes owned pixels while old package is retained for subsequent real crash recovery',
  )
  return transformed
}
